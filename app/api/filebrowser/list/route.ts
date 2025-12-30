import { NextRequest, NextResponse } from 'next/server';
import { filebrowserClient } from '@/lib/filebrowser-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let path = searchParams.get('path') || '/';

    // Normalize path - ensure it starts with / and doesn't have undefined
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    
    // Remove any undefined segments
    path = path.replace(/undefined/g, '').replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    const resources = await filebrowserClient.listResources(path);

    return NextResponse.json(resources);
  } catch (error) {
    console.error('Filebrowser list error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to list resources';
    
    // Provide more helpful error messages
    if (errorMessage.includes('undefined') || errorMessage.includes('source')) {
      return NextResponse.json(
        { 
          error: 'Filebrowser source configuration error. Please check FILEBROWSER_SOURCE environment variable.',
          details: errorMessage 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

