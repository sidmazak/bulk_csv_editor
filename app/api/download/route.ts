import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), 'tmp');

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fileParam = searchParams.get('file');

    if (!fileParam) {
      return NextResponse.json(
        { error: 'File parameter is required' },
        { status: 400 }
      );
    }

    // Security: prevent directory traversal
    const safePath = path.normalize(fileParam).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(TMP_DIR, safePath);

    // Verify file exists and is within tmp directory
    if (!filePath.startsWith(TMP_DIR)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const fileBuffer = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);

    // Determine content type
    const contentType = filename.endsWith('.zip')
      ? 'application/zip'
      : 'text/csv';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stats.size.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download file' },
      { status: 500 }
    );
  }
}

