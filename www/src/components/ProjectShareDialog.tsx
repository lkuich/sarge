import { Share2 } from "lucide-react";
import type { ProjectShare, ProjectShareRole } from "@/lib/sarge-demo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ProjectShareDialogProps {
  projectName: string;
  shares: ProjectShare[];
  shareLimit: number | null;
  shareCount: number;
  error?: string;
  warning?: string;
  success?: string;
}

const roleOptions: Array<{ value: ProjectShareRole; label: string }> = [
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

export default function ProjectShareDialog({
  projectName,
  shares,
  shareLimit,
  shareCount,
  error,
  warning,
  success,
}: ProjectShareDialogProps) {
  const shareLimitReached = shareLimit !== null && shareCount >= shareLimit;
  const shareLimitLabel = shareLimit === null ? "Unlimited" : `${shareCount} / ${shareLimit}`;

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm" data-project-share-dialog />
        }
      >
        <Share2 className="size-4" />
        Share
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Share {projectName}</SheetTitle>
          <SheetDescription>Invite a teammate and choose what they can do in this project.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-4 pb-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Shared user limit</p>
              <Badge variant={shareLimitReached ? "secondary" : "outline"}>{shareLimitLabel}</Badge>
            </div>
            {shareLimitReached && (
              <p className="mt-2 text-xs text-muted-foreground">
                Upgrade to invite more people to this project.{" "}
                <a className="font-medium text-primary hover:underline" href="/app/billing">
                  View plans
                </a>
              </p>
            )}
          </div>

          {error && (
            <Alert>
              <AlertTitle>Project was not shared</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {warning && (
            <Alert>
              <AlertTitle>Invite saved</AlertTitle>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertTitle>Sharing updated</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <form method="post" className="grid gap-3 rounded-md border p-3">
            <input type="hidden" name="intent" value="share-project" />
            <div className="grid gap-2">
              <Label htmlFor="shareEmail">Email</Label>
              <Input id="shareEmail" name="email" type="email" placeholder="teammate@example.com" required disabled={shareLimitReached} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shareRole">Role</Label>
              <select
                id="shareRole"
                name="role"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue="view"
                disabled={shareLimitReached}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={shareLimitReached}>Send invite</Button>
          </form>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Shared with</p>
              <Badge variant="outline">{shares.length}</Badge>
            </div>
            {shares.length > 0 ? (
              <div className="grid gap-2">
                {shares.map((share) => (
                  <div key={share.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{share.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{share.status}</p>
                      </div>
                      <Badge variant={share.role === "edit" ? "default" : "secondary"}>{share.role}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form method="post" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="update-project-share" />
                        <input type="hidden" name="shareId" value={share.id} />
                        <select
                          name="role"
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          defaultValue={share.role}
                        >
                          {roleOptions.map((role) => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                        <Button type="submit" variant="outline" size="sm">Update</Button>
                      </form>
                      <form method="post">
                        <input type="hidden" name="intent" value="remove-project-share" />
                        <input type="hidden" name="shareId" value={share.id} />
                        <Button type="submit" variant="ghost" size="sm">Remove</Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No one else has access yet.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
