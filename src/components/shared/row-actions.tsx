"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RowActionsProps {
  /** Called when the edit (pencil) button is clicked. */
  onEdit?: () => void;
  /** Called when the delete (trash) button is clicked. */
  onDelete?: () => void;
  /** Accessible label / tooltip for the edit button. */
  editLabel?: string;
  /** Accessible label / tooltip for the delete button. */
  deleteLabel?: string;
  /** Disable both buttons (e.g. while a transition is in flight). */
  disabled?: boolean;
}

/**
 * RowActions — a tiny presentational cluster of edit + delete icon buttons
 * for table rows. Purely presentational: the parent owns all state (opening
 * the edit dialog, opening the delete confirmation, etc.) via the callbacks.
 *
 * Uses ghost variant, icon-sm size (h-8 w-8) so it blends into dense tables.
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  disabled,
}: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {onEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          disabled={disabled}
          title={editLabel}
          aria-label={editLabel}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={disabled}
          title={deleteLabel}
          aria-label={deleteLabel}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
