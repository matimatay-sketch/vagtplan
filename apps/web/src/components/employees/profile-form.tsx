"use client";
import { useActionState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { FormMessage, SubmitButton } from "@/components/form";
import { changeMemberProfileAction } from "@/lib/actions/access";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function MemberProfileForm({
  userId,
  profileId,
  profiles,
  label,
}: {
  userId: string;
  profileId: string;
  profiles: { id: string; name: string }[];
  label: string;
}) {
  const [state, action] = useActionState(changeMemberProfileAction, initialActionState);
  return (
    <form action={action} className="grid gap-1.5" data-testid="member-profile-form">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex gap-2">
        <div className="min-w-40 flex-1">
          <NativeSelect name="profile_id" defaultValue={profileId} aria-label={label}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <SubmitButton variant="outline" size="sm" className="h-9">
          {da.common.changeProfile}
        </SubmitButton>
      </div>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}
