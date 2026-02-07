import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { X, MapPin, Trash2, Check } from 'lucide-react';
import type { FarmPin, PinCategory } from '@/types/portfolio';
import { PIN_CATEGORIES } from '@/types/portfolio';

interface PinDetailsPanelProps {
  pin: FarmPin;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Pick<FarmPin, 'name' | 'notes' | 'category'>>) => void;
  onDelete: (id: string) => void;
}

export function PinDetailsPanel({ pin, onClose, onUpdate, onDelete }: PinDetailsPanelProps) {
  const [name, setName] = useState(pin.name);
  const [notes, setNotes] = useState(pin.notes);
  const [category, setCategory] = useState<PinCategory>(pin.category);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasChanges = name !== pin.name || notes !== pin.notes || category !== pin.category;

  const handleSave = () => {
    onUpdate(pin.id, { name, notes, category });
  };

  const catConfig = PIN_CATEGORIES.find(c => c.id === category);

  return (
    <Card className="absolute top-4 right-4 w-80 max-h-[80vh] overflow-y-auto z-50 shadow-2xl bg-white dark:bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: catConfig?.color }}
            />
            <CardTitle className="text-base leading-tight truncate">
              {pin.name}
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Coordinates */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</span>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="pin-name" className="text-xs">Name</Label>
          <Input
            id="pin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Farm name..."
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as PinCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIN_CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="pin-notes" className="text-xs">Notes</Label>
          <textarea
            id="pin-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this farm..."
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          {hasChanges && (
            <Button onClick={handleSave} size="sm" className="flex-1">
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          )}
          {confirmDelete ? (
            <div className="flex gap-2 flex-1">
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => onDelete(pin.id)}>
                Confirm
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
