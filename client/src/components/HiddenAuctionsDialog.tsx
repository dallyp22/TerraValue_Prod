import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Eye } from 'lucide-react';
import type { HiddenAuction } from '@/hooks/use-hidden-auctions';

interface HiddenAuctionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hiddenAuctions: HiddenAuction[];
  onUnhide: (id: number) => void;
  onUnhideAll: () => void;
}

export function HiddenAuctionsDialog({
  open,
  onOpenChange,
  hiddenAuctions,
  onUnhide,
  onUnhideAll,
}: HiddenAuctionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hidden Auctions</DialogTitle>
          <DialogDescription>
            {hiddenAuctions.length} auction{hiddenAuctions.length !== 1 ? 's' : ''} hidden from the map.
          </DialogDescription>
        </DialogHeader>

        {hiddenAuctions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hidden auctions.
          </p>
        ) : (
          <>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {hiddenAuctions.map((auction) => (
                <div
                  key={auction.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{auction.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Hidden {new Date(auction.hiddenAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUnhide(auction.id)}
                    className="shrink-0"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Unhide
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={onUnhideAll}>
                Unhide All
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
