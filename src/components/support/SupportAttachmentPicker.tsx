"use client";

import {
  formatAttachmentSize,
  SUPPORT_ATTACHMENT_ACCEPT,
  validateSupportAttachmentFiles,
} from "@/lib/support-attachments";

type SupportAttachmentPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  dark?: boolean;
  disabled?: boolean;
};

export default function SupportAttachmentPicker({
  files,
  onChange,
  dark = false,
  disabled = false,
}: SupportAttachmentPickerProps) {
  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const nextFiles = [...files, ...Array.from(selected)];
    const validationError = validateSupportAttachmentFiles(nextFiles);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    onChange(nextFiles);
  }

  return (
    <div className="mt-4">
      <label
        className={`inline-flex cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${dark ? "border-zinc-700 text-zinc-200 hover:border-amber-300" : "border-slate-300 text-slate-700 hover:border-cyan-500"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        Attachments (optional)
        <input
          type="file"
          accept={SUPPORT_ATTACHMENT_ACCEPT}
          multiple
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      {files.length > 0 && (
        <ul
          className={`mt-3 space-y-2 text-xs ${dark ? "text-zinc-300" : "text-slate-600"}`}
        >
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">
                {file.name}{" "}
                <span className={dark ? "text-zinc-500" : "text-slate-400"}>
                  ({formatAttachmentSize(file.size)})
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(files.filter((_, fileIndex) => fileIndex !== index))
                }
                disabled={disabled}
                className={
                  dark
                    ? "font-semibold text-amber-300"
                    : "font-semibold text-cyan-700"
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
