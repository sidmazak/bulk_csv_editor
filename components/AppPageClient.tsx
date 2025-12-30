'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { UploadPanel } from '@/components/UploadPanel';
import { CSVProcessorPanel } from '@/components/CSVProcessorPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function AppPageClient() {
  const pathname = usePathname();
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{ path: string; name: string; url?: string; file?: File }>
  >([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [shouldBlock, setShouldBlock] = useState(false);
  // Track if we're programmatically navigating (to skip beforeunload)
  const isProgrammaticNavigation = useRef(false);

  // Prevent page close/refresh when files are uploaded
  // Only show browser dialog for actual close/refresh, not for link navigation
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setShouldBlock(false);
      return;
    }

    setShouldBlock(true);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Skip if we're programmatically navigating (user already confirmed in our custom dialog)
      if (isProgrammaticNavigation.current) {
        return;
      }
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
      return ''; // Required for some browsers
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setShouldBlock(false);
    };
  }, [selectedFiles.length]);

  // Intercept link clicks
  useEffect(() => {
    if (!shouldBlock) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (link && link.href) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        // Only intercept if navigating away from /app
        if (url.pathname !== currentUrl.pathname && url.pathname !== '/app') {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(link.href);
          setShowConfirmDialog(true);
        }
      }
    };

    document.addEventListener('click', handleClick, true); // Use capture phase

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [shouldBlock]);

  // Intercept browser back/forward buttons
  useEffect(() => {
    if (!shouldBlock) return;

    // Push a state to history so we can detect back button
    window.history.pushState({ preventBack: true }, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      if (selectedFiles.length > 0) {
        // Show confirmation dialog
        setPendingNavigation(window.location.href);
        setShowConfirmDialog(true);
        // Push state back to prevent navigation
        window.history.pushState({ preventBack: true }, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [shouldBlock, selectedFiles.length]);

  const handleConfirmLeave = () => {
    setShowConfirmDialog(false);
    if (pendingNavigation) {
      const url = pendingNavigation;
      setPendingNavigation(null);
      // Set flag to skip beforeunload since user already confirmed
      isProgrammaticNavigation.current = true;
      // Navigate
      window.location.href = url;
    }
  };

  const handleCancelLeave = () => {
    setShowConfirmDialog(false);
    setPendingNavigation(null);
  };

  return (
    <>
      <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-black">
        {/* Left Panel - Upload */}
        <div className="w-1/3 min-w-[300px] max-w-[400px] h-full overflow-hidden">
          <UploadPanel onFilesSelected={setSelectedFiles} />
        </div>

        {/* Right Panel - CSV Processor */}
        <div className="flex-1 overflow-hidden h-full">
          <CSVProcessorPanel selectedFiles={selectedFiles} />
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => {
        if (!open) {
          handleCancelLeave();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Editor?</DialogTitle>
            <DialogDescription>
              You have {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} uploaded. 
              Are you sure you want to leave? Your files and any unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelLeave}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>
              Leave Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

