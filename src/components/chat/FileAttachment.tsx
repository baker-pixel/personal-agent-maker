import { useRef, forwardRef } from "react";
import { Paperclip, X, FileText, Image } from "lucide-react";

export interface Attachment {
  file: File;
  preview?: string;
  url?: string;
}

interface FileAttachmentProps {
  attachments: Attachment[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}

export const FileAttachmentButton = forwardRef<
  HTMLButtonElement,
  { onAdd: (files: FileList) => void }
>(function FileAttachmentButton({ onAdd }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.csv,.docx,.xlsx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        ref={ref}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 p-2.5 rounded-xl text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
        title="Attach files"
        type="button"
      >
        <Paperclip className="w-4 h-4" />
      </button>
    </>
  );
});

export const AttachmentPreview = ({ attachments, onRemove }: Omit<FileAttachmentProps, "onAdd">) => {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
      {attachments.map((att, i) => (
        <div
          key={i}
          className="relative group shrink-0 w-16 h-16 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden"
        >
          {att.preview ? (
            <img src={att.preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              {att.file.type.includes("image") ? (
                <Image className="w-5 h-5 text-muted-foreground/60" />
              ) : (
                <FileText className="w-5 h-5 text-muted-foreground/60" />
              )}
              <span className="text-[8px] text-muted-foreground/50 max-w-[50px] truncate">
                {att.file.name.split(".").pop()?.toUpperCase()}
              </span>
            </div>
          )}
          <button
            onClick={() => onRemove(i)}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
