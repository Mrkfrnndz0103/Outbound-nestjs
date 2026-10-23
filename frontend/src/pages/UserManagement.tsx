import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  UserX,
  X,
} from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "../components/Modal";
import { Skiper87 } from "../components/ui/skiper-ui/skiper87";
import { api } from "../lib/api";
import {
  compactFormDialogClass,
  dialogActionsClass,
  dialogFormClass,
  dialogHeadClass,
  dialogInputClass,
  dialogLabelClass,
  formErrorClass,
  genericTableScrollClass,
  genericTableWrapClass,
  iconButtonClass,
  secondaryButtonClass,
  tableActionClass,
  usersActiveStatusClass,
  usersAvatarClass,
  usersDialogClass,
  usersDialogCopyClass,
  usersDisabledStatusClass,
  usersIdentityClass,
  usersLoadingClass,
  usersLoadingRowClass,
  usersPageClass,
  usersPageKickerClass,
  usersPrimaryActionClass,
  usersResetConfirmClass,
  usersResetCopyClass,
  usersResetIconClass,
  usersResetIdentityClass,
  usersResetLabelClass,
  usersRoleSelectClass,
  usersSearchClass,
  usersSummaryCardClass,
  usersSummaryClass,
  usersSummaryIconClass,
  usersTableCellClass,
  usersTableClass,
  usersTableHeadCellClass,
  usersTablePanelClass,
  usersTableStateClass,
  usersToolbarActionsClass,
  usersToolbarClass,
} from "../lib/uiClasses";
import type { ManagedUser, Role } from "../types";

const roles: Role[] = ["ops_pic", "fte_ops", "fte_mm", "doc_officer"];
const roleLabels: Record<Role, string> = {
  ops_pic: "Ops PIC",
  fte_ops: "FTE Operations",
  fte_mm: "FTE Midmile",
  doc_officer: "DOC Officer",
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function formatJoinedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function UserManagement() {
  const client = useQueryClient();
  const modalTrigger = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [search, setSearch] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<{
    name: string;
    password: string;
  } | null>(null);
  const [credentialCopied, setCredentialCopied] = useState(false);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: ({ signal }) => api<{ data: ManagedUser[] }>("/users", { signal }),
  });
  const create = useMutation({
    mutationFn: (body: {
      name: string;
      ops_id: string;
      role: "ops_pic" | "doc_officer";
    }) =>
      api<{ name: string; initial_password: string }>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (data) => {
      setCreating(false);
      setIssuedCredential({ name: data.name, password: data.initial_password });
      await client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }),
  });
  const disable = useMutation({
    mutationFn: (id: string) =>
      api(`/users/${id}/disable`, { method: "PATCH" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }),
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      api<{ initial_password: string }>(`/users/${id}/reset-password`, {
        method: "POST",
      }),
    onSuccess: async (data) => {
      setIssuedCredential({
        name: resetUser?.name ?? "User",
        password: data.initial_password,
      });
      setCredentialCopied(false);
      setResetUser(null);
      await client.invalidateQueries({ queryKey: ["users"] });
    },
  });

  async function copyIssuedCredential() {
    if (!issuedCredential) return;
    try {
      await navigator.clipboard.writeText(issuedCredential.password);
      setCredentialCopied(true);
    } catch {
      setCredentialCopied(false);
    }
  }

  function closeIssuedCredential() {
    setIssuedCredential(null);
    setCredentialCopied(false);
  }

  const allUsers = users.data?.data ?? [];
  const query = search.trim().toLowerCase();
  const filteredUsers = query
    ? allUsers.filter((user) =>
        [user.name, user.email, user.ops_id, roleLabels[user.role]].some(
          (value) => value?.toLowerCase().includes(query),
        ),
      )
    : allUsers;
  const activeUsers = allUsers.filter((user) => user.is_active).length;
  const roleCount = new Set(allUsers.map((user) => user.role)).size;

  return (
    <div className={usersPageClass}>
      <section className={usersSummaryClass} aria-label="User account summary">
        <div className={usersSummaryCardClass}>
          <span className={usersSummaryIconClass}>
            <Users size={17} />
          </span>
          <span className="grid gap-[.05rem]">
            <small className="text-xs font-medium text-soc5-muted">
              Total users
            </small>
            <strong className="text-base leading-tight font-semibold tabular-nums text-soc5-ink">
              {allUsers.length}
            </strong>
          </span>
        </div>
        <div className={usersSummaryCardClass}>
          <span
            className={`${usersSummaryIconClass} bg-linehaul-lime-surface text-linehaul-lime-ink`}
          >
            <ShieldCheck size={17} />
          </span>
          <span className="grid gap-[.05rem]">
            <small className="text-xs font-medium text-soc5-muted">
              Active accounts
            </small>
            <strong className="text-base leading-tight font-semibold tabular-nums text-soc5-ink">
              {activeUsers}
            </strong>
          </span>
        </div>
        <div className={usersSummaryCardClass}>
          <span
            className={`${usersSummaryIconClass} bg-linehaul-surface-soft text-status-info-ink`}
          >
            <UserRound size={17} />
          </span>
          <span className="grid gap-[.05rem]">
            <small className="text-xs font-medium text-soc5-muted">
              Role groups
            </small>
            <strong className="text-base leading-tight font-semibold tabular-nums text-soc5-ink">
              {roleCount}
            </strong>
          </span>
        </div>
      </section>

      {(update.error || disable.error || reset.error) && (
        <p className="notice error mx-auto mb-2 w-full max-w-[74rem] text-[var(--color-danger)]">
          {(update.error || disable.error || reset.error)?.message}
        </p>
      )}
      <section className={usersTablePanelClass}>
        <div className={usersToolbarClass}>
          <div>
            <h2 className="m-0 text-sm font-semibold tracking-tight text-soc5-ink">
              Directory
            </h2>
            <p className="mt-[.2rem] text-xs text-soc5-muted">
              {query
                ? `${filteredUsers.length} matching accounts`
                : "All provisioned accounts"}
            </p>
          </div>
          <div className={usersToolbarActionsClass}>
            <label className={usersSearchClass}>
              <Search size={16} />
              <span className="sr-only">Search users</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or role"
              />
            </label>
            <button
              className={usersPrimaryActionClass}
              type="button"
              onClick={(event) => {
                modalTrigger.current = event.currentTarget;
                setCreating(true);
              }}
            >
              <Plus size={17} />
              Add Ops PIC
            </button>
          </div>
        </div>
        {users.isPending ? (
          <UserTableLoading />
        ) : users.error ? (
          <div className={usersTableStateClass}>
            <strong>Unable to load users</strong>
            <p>{users.error.message}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={usersTableStateClass}>
            <strong>{query ? "No matching users" : "No users yet"}</strong>
            <p>
              {query
                ? "Try a different name, email, or role."
                : "Create an Ops PIC account to start building the directory."}
            </p>
          </div>
        ) : (
          <div className={genericTableWrapClass}>
            <Skiper87 className={genericTableScrollClass}>
              <table className={usersTableClass}>
                <thead>
                  <tr>
                    <th className={usersTableHeadCellClass}>User</th>
                    <th className={usersTableHeadCellClass}>Identifier</th>
                    <th className={usersTableHeadCellClass}>Role</th>
                    <th className={usersTableHeadCellClass}>Status</th>
                    <th className={usersTableHeadCellClass}>Joined</th>
                    <th className={usersTableHeadCellClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className={usersTableCellClass}>
                        <div className={usersIdentityClass}>
                          <span className={usersAvatarClass}>
                            {initials(user.name)}
                          </span>
                          <span className="grid min-w-0 gap-[.15rem]">
                            <strong className="overflow-hidden text-xs text-soc5-ink text-ellipsis whitespace-nowrap">
                              {user.name}
                            </strong>
                            <small className="text-xs text-soc5-muted">
                              {user.is_active
                                ? "Account enabled"
                                : "Account disabled"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td className={usersTableCellClass}>
                        <span className="text-xs text-soc5-muted">
                          {user.email || user.ops_id || "-"}
                        </span>
                      </td>
                      <td className={usersTableCellClass}>
                        <select
                          className={usersRoleSelectClass}
                          aria-label={`Role for ${user.name}`}
                          value={user.role}
                          onChange={(event) =>
                            update.mutate({
                              id: user.id,
                              body: {
                                name: user.name,
                                role: event.target.value as Role,
                              },
                            })
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={usersTableCellClass}>
                        <span
                          className={
                            user.is_active
                              ? usersActiveStatusClass
                              : usersDisabledStatusClass
                          }
                        >
                          <i
                            className={`size-[.3rem] rounded-full ${user.is_active ? "bg-[#55aa7b] shadow-[0_0_0_.15rem_rgb(85_170_123_/_14%)]" : "bg-[#aeb7b7]"}`}
                          />
                          {user.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className={usersTableCellClass}>
                        <span className="whitespace-nowrap text-soc5-muted">
                          {formatJoinedDate(user.created_at)}
                        </span>
                      </td>
                      <td
                        className={`${usersTableCellClass} whitespace-nowrap`}
                      >
                        {user.is_active && (
                          <>
                            {user.role === "ops_pic" && (
                              <button
                                className={tableActionClass}
                                type="button"
                                aria-label={`Reset password for ${user.name}`}
                                onClick={(event) => {
                                  modalTrigger.current = event.currentTarget;
                                  setResetUser(user);
                                }}
                              >
                                <RotateCcw size={15} />
                                Reset Password
                              </button>
                            )}
                            <button
                              className={`${tableActionClass} border-[#a83240] text-status-danger-ink hover:bg-status-danger-surface`}
                              type="button"
                              aria-label={`Disable ${user.name}`}
                              onClick={() => disable.mutate(user.id)}
                            >
                              <UserX size={15} />
                              Disable
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Skiper87>
          </div>
        )}
      </section>
      {creating && (
        <CreateUser
          returnFocus={modalTrigger.current}
          busy={create.isPending}
          error={create.error?.message}
          onClose={() => setCreating(false)}
          onSubmit={(body) => create.mutate(body)}
        />
      )}
      <Modal
        open={resetUser !== null}
        returnFocus={modalTrigger.current}
        onClose={() => !reset.isPending && setResetUser(null)}
        ariaLabel="Reset user password"
        className={`${compactFormDialogClass} ${usersDialogClass}`}
      >
        <div className={dialogHeadClass}>
          <div>
            <p className={usersPageKickerClass}>Account recovery</p>
            <h2>Reset password</h2>
          </div>
          <button
            className={iconButtonClass}
            type="button"
            disabled={reset.isPending}
            onClick={() => !reset.isPending && setResetUser(null)}
            aria-label="Cancel password reset"
          >
            <X size={18} />
          </button>
        </div>
        <div className={usersResetIdentityClass}>
          <span className={usersResetIconClass} aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <div>
            <span className={usersResetLabelClass}>Account access</span>
            <strong>{resetUser?.name}</strong>
          </div>
        </div>
        <p className={usersResetCopyClass}>
          This will invalidate the current password and issue a one-time
          password. {resetUser?.name} must create a new password at the next
          sign-in.
        </p>
        {reset.error && (
          <p className="notice error text-[var(--color-danger)]" role="alert">
            {reset.error.message}
          </p>
        )}
        <div className={dialogActionsClass}>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={reset.isPending}
            onClick={() => setResetUser(null)}
          >
            Keep current password
          </button>
          <button
            type="button"
            className={usersResetConfirmClass}
            disabled={reset.isPending}
            aria-busy={reset.isPending}
            onClick={() => resetUser && reset.mutate(resetUser.id)}
          >
            {reset.isPending ? "Resetting..." : "Reset password"}
          </button>
        </div>
      </Modal>
      <Modal
        open={issuedCredential !== null}
        returnFocus={modalTrigger.current}
        onClose={closeIssuedCredential}
        ariaLabel="One-time password issued"
        className={`${compactFormDialogClass} ${usersDialogClass}`}
      >
        <div className={dialogHeadClass}>
          <div>
            <p className={usersPageKickerClass}>Share securely</p>
            <h2>One-time password for {issuedCredential?.name}</h2>
          </div>
          <button
            className={iconButtonClass}
            type="button"
            onClick={closeIssuedCredential}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className={usersDialogCopyClass}>
          This password is shown only once. Share it with{" "}
          {issuedCredential?.name} through a secure channel — it will not be
          shown again.
        </p>
        <div className="mx-[1.1rem] mt-4 flex items-center justify-between gap-2 rounded-[.55rem] border border-dashed border-soc5-line bg-linehaul-surface-soft p-[.7rem] max-[640px]:mx-3">
          <code>{issuedCredential?.password}</code>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void copyIssuedCredential()}
            aria-label="Copy one-time password"
          >
            {credentialCopied ? <Check size={15} /> : <Copy size={15} />}
            {credentialCopied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className={dialogActionsClass}>
          <button type="button" onClick={closeIssuedCredential}>
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}

function UserTableLoading() {
  return (
    <div
      className={usersLoadingClass}
      role="status"
      aria-label="Loading users"
      aria-busy="true"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div className={usersLoadingRowClass} key={index}>
          <Skeleton className="h-2.5 w-[72%]" />
          <Skeleton className="h-2.5" />
          <Skeleton className="h-2.5" />
          <Skeleton className="h-2.5 w-[64%]" />
        </div>
      ))}
    </div>
  );
}

function CreateUser({
  busy,
  returnFocus,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  returnFocus?: HTMLElement | null;
  error?: string;
  onClose: () => void;
  onSubmit: (body: {
    name: string;
    ops_id: string;
    role: "ops_pic" | "doc_officer";
  }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      name: String(data.get("name") ?? ""),
      ops_id: String(data.get("ops_id") ?? ""),
      role: String(data.get("role") ?? "ops_pic") as "ops_pic" | "doc_officer",
    });
  }
  return (
    <Modal
      returnFocus={returnFocus}
      open
      onClose={onClose}
      className={`${compactFormDialogClass} ${usersDialogClass}`}
      ariaLabel="Add backroom user"
    >
      <div className={dialogHeadClass}>
        <h2>Add backroom user</h2>
        <button
          className={iconButtonClass}
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <form className={dialogFormClass} onSubmit={submit}>
        <label className={dialogLabelClass}>
          Name
          <input className={dialogInputClass} name="name" required />
        </label>
        <label className={dialogLabelClass}>
          Role
          <select
            className={dialogInputClass}
            name="role"
            defaultValue="ops_pic"
          >
            <option value="ops_pic">Ops PIC</option>
            <option value="doc_officer">DOC Officer</option>
          </select>
        </label>
        <label className={dialogLabelClass}>
          OPS ID
          <input
            className={dialogInputClass}
            name="ops_id"
            required
            pattern="ops[0-9]+"
            placeholder="ops12345"
          />
        </label>
        {error && <p className={formErrorClass}>{error}</p>}
        <div className={dialogActionsClass}>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
