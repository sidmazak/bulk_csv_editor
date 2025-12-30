import { NextRequest, NextResponse } from 'next/server';
import { filebrowserClient } from '@/lib/filebrowser-client';

/**
 * Recursively get all CSV files from a directory
 */
async function getAllCSVFilesRecursive(
  path: string,
  allFiles: Array<{ path: string; name: string }> = []
): Promise<Array<{ path: string; name: string }>> {
  try {
    const resources = await filebrowserClient.listResources(path);

    // Add CSV files from current directory with constructed paths
    resources.files
      .filter((file) => file.name.toLowerCase().endsWith('.csv'))
      .forEach((file) => {
        // Construct full path since ItemInfo doesn't have path property
        const filePath = path === '/' ? `/${file.name}` : `${path}/${file.name}`;
        allFiles.push({
          path: filePath,
          name: file.name,
        });
      });

    // Recursively process subdirectories
    for (const folder of resources.folders) {
      // Construct subdirectory path using current path
      const subPath = path === '/' ? `/${folder.name}` : `${path}/${folder.name}`;
      await getAllCSVFilesRecursive(subPath, allFiles);
    }

    return allFiles;
  } catch (error) {
    console.error(`Error processing directory ${path}:`, error);
    return allFiles;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get('path') || '/';

    const csvFiles = await getAllCSVFilesRecursive(path);

    return NextResponse.json({ files: csvFiles });
  } catch (error) {
    console.error('Error getting CSV files:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to get CSV files',
      },
      { status: 500 }
    );
    }
}

