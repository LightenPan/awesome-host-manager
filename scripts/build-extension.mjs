import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rootDir, 'public')
const buildDir = path.join(rootDir, 'build')
const manifestFiles = {
  chrome: 'manifest.json',
  firefox: 'manifest.firefox.json'
}
const requestedTarget = process.argv[2] || 'all'
const targets = requestedTarget === 'all' ? ['chrome', 'firefox'] : [requestedTarget]

if (!targets.every(target => target in manifestFiles)) {
  console.error(`Unknown target "${requestedTarget}". Use chrome, firefox, or all.`)
  process.exit(1)
}

function buildTarget(target) {
  const targetDir = path.join(buildDir, target)
  const manifestPath = path.join(publicDir, manifestFiles[target])
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  copyPublicFiles(publicDir, targetDir, target)

  fs.writeFileSync(
    path.join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )

  const extension = target === 'firefox' ? 'xpi' : 'zip'
  const archivePath = path.join(
    buildDir,
    `awesome-host-manager-${manifest.version}-${target}.${extension}`
  )
  const packagedPath = packageArchive(targetDir, archivePath)

  console.log(`${target}: ${path.relative(rootDir, targetDir)}`)
  console.log(`${target}: ${path.relative(rootDir, packagedPath)}`)
}

function copyPublicFiles(sourceDir, targetDir, target, relativeDir = '') {
  for (const entry of fs.readdirSync(path.join(sourceDir, relativeDir), { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name)
    const normalizedPath = relativePath.split(path.sep).join('/')

    if (normalizedPath === manifestFiles.firefox) continue
    if (target === 'firefox' && normalizedPath === manifestFiles.chrome) continue

    const sourcePath = path.join(sourceDir, relativePath)
    const destinationPath = path.join(targetDir, relativePath)

    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true })
      copyPublicFiles(sourceDir, targetDir, target, relativePath)
    } else {
      fs.copyFileSync(sourcePath, destinationPath)
    }
  }
}

function createZip(sourceDir, archivePath) {
  const files = []
  collectFiles(sourceDir, '', files)
  files.sort((a, b) => a.name.localeCompare(b.name))

  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const content = fs.readFileSync(file.path)
    const compressed = zlib.deflateRawSync(content)
    const checksum = crc32(content)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(content.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)

    const localEntry = Buffer.concat([localHeader, name, compressed])

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(content.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)

    localParts.push(localEntry)
    centralParts.push(Buffer.concat([centralHeader, name]))
    localOffset += localEntry.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(files.length, 8)
  endOfCentralDirectory.writeUInt16LE(files.length, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12)
  endOfCentralDirectory.writeUInt32LE(localOffset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  fs.writeFileSync(
    archivePath,
    Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory])
  )
}

function packageArchive(sourceDir, archivePath) {
  try {
    createZip(sourceDir, archivePath)
    return archivePath
  } catch (error) {
    if (!['EACCES', 'EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) throw error

    const extension = path.extname(archivePath)
    const fallbackPath = archivePath.replace(
      new RegExp(`${extension.replace('.', '\\.')}$`),
      `-${Date.now()}${extension}`
    )
    createZip(sourceDir, fallbackPath)
    console.warn(`${path.basename(archivePath)} is locked; wrote ${path.basename(fallbackPath)}`)
    return fallbackPath
  }
}

function collectFiles(sourceDir, relativeDir, files) {
  const currentDir = path.join(sourceDir, relativeDir)

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name

    if (entry.isDirectory()) {
      collectFiles(sourceDir, relativePath, files)
    } else {
      files.push({
        name: relativePath.split(path.sep).join('/'),
        path: path.join(sourceDir, relativePath)
      })
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

for (const target of targets) {
  buildTarget(target)
}
