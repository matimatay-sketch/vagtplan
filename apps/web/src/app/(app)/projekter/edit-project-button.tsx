"use client";
import { useCallback, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { da } from "@/lib/i18n/da";
import { ProjectForm } from "./project-form";

export function EditProjectButton({
  project,
  departments,
}: {
  project: {
    id: string;
    number: string;
    name: string;
    customer: string | null;
    departmentIds: string[];
  };
  departments: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${da.projects.edit} ${project.number}`}
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{da.projects.edit}</DialogTitle>
        </DialogHeader>
        {open ? <ProjectForm departments={departments} project={project} onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
