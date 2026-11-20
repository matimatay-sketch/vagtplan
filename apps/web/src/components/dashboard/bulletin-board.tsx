"use client";
import { useState, useTransition } from "react";
import { Megaphone, Pin, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/form";
import { createPostAction, deletePostAction, updatePostAction } from "@/lib/actions/bulletin";
import { da } from "@/lib/i18n/da";

const t = da.dashboard;

export type BoardPost = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  departmentId: string | null;
  expiresOn: string | null;
  departmentName: string | null;
  createdAt: string;
  author: string | null;
  canDelete: boolean;
};

/** Posts for the user's departments and the whole organization; managers can post. */
export function BulletinBoard({
  posts,
  postTo,
}: {
  posts: BoardPost[];
  /** Where the user may post (null id = the whole organization). */
  postTo: { id: string | null; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  // The post being edited (null = a new post).
  const [editing, setEditing] = useState<string | null>(null);
  const [dept, setDept] = useState(postTo[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, start] = useTransition();
  const reset = () => {
    setTitle("");
    setBody("");
    setPinned(false);
    setExpiresOn("");
    setEditing(null);
    setOpen(false);
  };
  const edit = (p: BoardPost) => {
    setEditing(p.id);
    setDept(p.departmentId ?? "");
    setTitle(p.title);
    setBody(p.body);
    setPinned(p.pinned);
    setExpiresOn(p.expiresOn ?? "");
    setOpen(true);
  };
  return (
    <div className="grid gap-3" data-testid="bulletin-board">
      {postTo.length > 0 ? (
        open ? (
          <div className="grid gap-3 rounded-lg border p-3" data-testid="bulletin-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.postTo} htmlFor="post-dept">
                <NativeSelect id="post-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
                  {postTo.map((d) => (
                    <option key={d.id ?? "all"} value={d.id ?? ""}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={`${t.expiresOn} (${da.common.optional})`} htmlFor="post-expires">
                <Input
                  id="post-expires"
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t.postTitle} htmlFor="post-title">
              <Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t.postBody} htmlFor="post-body">
              <Textarea
                id="post-body"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              {t.pin}
            </label>
            <div className="flex gap-2">
              <Button
                disabled={busy || !title.trim()}
                onClick={() =>
                  start(async () => {
                    const input = {
                      departmentId: dept || null,
                      title,
                      body,
                      pinned,
                      expiresOn: expiresOn || null,
                    };
                    const r = editing
                      ? await updatePostAction(editing, input)
                      : await createPostAction(input);
                    if (r.ok) {
                      toast.success(r.message);
                      reset();
                    } else toast.error(r.message);
                  })
                }
              >
                {editing ? t.savePost : t.publish}
              </Button>
              <Button variant="ghost" onClick={reset}>
                {da.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Megaphone /> {t.newPost}
            </Button>
          </div>
        )
      ) : null}
      {posts.length === 0 ? <p className="text-sm text-muted-foreground">{t.noPosts}</p> : null}
      <ul className="grid gap-2">
        {posts.map((p) => (
          <li
            key={p.id}
            className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm"
            data-testid="bulletin-post"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                {p.pinned ? <Pin className="size-3.5 text-signal" aria-label={t.pinned} /> : null}
                {p.title}
              </span>
              {p.canDelete ? (
                <span className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`${t.editPost} ${p.title}`}
                    disabled={busy}
                    onClick={() => edit(p)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`${da.common.archive} ${p.title}`}
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await deletePostAction(p.id);
                        if (!r.ok) toast.error(r.message);
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </span>
              ) : null}
            </span>
            {p.body ? <span className="whitespace-pre-wrap">{p.body}</span> : null}
            <span className="text-xs text-muted-foreground">
              {p.departmentName ?? t.everyone}
              {p.author ? ` · ${p.author}` : ""} · {p.createdAt}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
