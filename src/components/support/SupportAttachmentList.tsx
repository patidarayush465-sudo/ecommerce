"use client";

type SupportAttachment = { url: string; publicId: string; fileName: string; mimeType: string; size: number };

export default function SupportAttachmentList({ attachments, dark = false }: { attachments?: SupportAttachment[]; dark?: boolean }) {
  if (!attachments?.length) return null;
  return <div className="mt-3 flex flex-wrap gap-3">{attachments.map((attachment) => attachment.mimeType.startsWith("image/") ? <a key={`${attachment.publicId}-${attachment.fileName}`} href={attachment.url} target="_blank" rel="noreferrer" className="block"><img src={attachment.url} alt={attachment.fileName} className="h-20 w-20 rounded-lg object-cover" /><span className={`mt-1 block max-w-24 truncate text-[11px] ${dark ? "text-zinc-500" : "text-slate-500"}`}>{attachment.fileName}</span></a> : <a key={`${attachment.publicId}-${attachment.fileName}`} href={attachment.url} target="_blank" rel="noreferrer" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${dark ? "border-zinc-700 text-amber-300" : "border-slate-300 text-cyan-700"}`}>Open PDF: {attachment.fileName}</a>)}</div>;
}
