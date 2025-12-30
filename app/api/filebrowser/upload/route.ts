import { NextRequest, NextResponse } from 'next/server';
import { filebrowserClient } from '@/lib/filebrowser-client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    const override = formData.get('override') === 'true';

    if (!file || !path) {
      return NextResponse.json(
        { error: 'File and path are required' },
        { status: 400 }
      );
    }

    await filebrowserClient.uploadFile(file, path, override);

    return NextResponse.json({ success: true, path });
  } catch (error) {
    console.error('Filebrowser upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}

