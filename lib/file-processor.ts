import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Readable } from 'stream';

const TMP_DIR = path.join(process.cwd(), 'tmp');
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Ensure tmp directory exists
export async function ensureTmpDir() {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create tmp directory:', error);
  }
}

// Save processed CSV to tmp directory
export async function saveProcessedFile(
  filename: string,
  content: string
): Promise<string> {
  await ensureTmpDir();
  
  const timestamp = Date.now();
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = path.join(TMP_DIR, `${timestamp}_${safeFilename}`);
  
  await fs.writeFile(filePath, content, 'utf8');
  
  return filePath;
}

// Create zip file from multiple CSV files
export async function createZipFile(
  files: Array<{ filename: string; filePath: string }>
): Promise<string> {
  await ensureTmpDir();
  
  const timestamp = Date.now();
  const zipPath = path.join(TMP_DIR, `processed_${timestamp}.zip`);
  
  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    files.forEach(({ filename, filePath }) => {
      archive.file(filePath, { name: filename });
    });

    archive.finalize();
  });
}

// Get download URL for file
export function getDownloadUrl(filePath: string): string {
  const relativePath = path.relative(TMP_DIR, filePath);
  return `/api/download?file=${encodeURIComponent(relativePath)}`;
}

// Cleanup old files (older than 1 hour)
export async function cleanupOldFiles() {
  try {
    await ensureTmpDir();
    const files = await fs.readdir(TMP_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;

      if (age > CLEANUP_INTERVAL) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Start periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldFiles, CLEANUP_INTERVAL);
}

