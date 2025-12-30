import { NextRequest, NextResponse } from 'next/server';
import { saveProcessedFile, getDownloadUrl } from '@/lib/file-processor';
import fs from 'fs/promises';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), 'tmp');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File must be a CSV file' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const content = buffer.toString('utf8');

    // Save to tmp directory
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(TMP_DIR, `${timestamp}_${safeFilename}`);
    
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');

    return NextResponse.json({
      success: true,
      filename: file.name,
      path: filePath,
      url: getDownloadUrl(filePath),
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}

