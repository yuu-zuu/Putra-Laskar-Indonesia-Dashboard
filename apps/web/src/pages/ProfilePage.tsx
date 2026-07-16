import type { UserProfile } from "@spbu/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../app/auth.js";
import { useI18n } from "../app/i18n.js";
import { useToast } from "../app/toasts.js";
import { ActivityLog } from "../components/ActivityLog.js";
import { PageHeader } from "../components/PageHeader.js";
import { Panel } from "../components/Panel.js";
import { getProfile, getProfiles, updateProfile, uploadAvatar } from "../data/profileGateway.js";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const { t, l } = useI18n();
  const toast = useToast();
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStage, setSaveStage] = useState<"idle" | "uploading" | "saving">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(() => profileIdFromHash() ?? user?.id ?? "");

  useEffect(() => {
    const onHash = () => setSelectedId(profileIdFromHash() ?? user?.id ?? "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [user?.id]);

  const load = async () => {
    try {
      setLoadError(null);
      const [list, selected] = await Promise.all([getProfiles(), getProfile(selectedId)]);
      setPeople(list);
      setProfile(selected);
      setDisplayName(selected.displayName);
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : l("Profil gagal dimuat.", "Could not load the profile.", "无法加载档案。"),
      );
    }
  };
  useEffect(() => {
    if (selectedId !== "") void load();
  }, [selectedId]);
  useEffect(
    () => () => {
      if (preview !== null) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const choose = (next: File | null) => {
    if (next === null) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      toast(
        l("Gunakan PNG, JPEG, atau WebP.", "Use PNG, JPEG, or WebP.", "请使用 PNG、JPEG 或 WebP。"),
        "error",
      );
      return;
    }
    if (next.size > 512_000) {
      toast(
        l(
          "Ukuran foto maksimal 500 KB.",
          "The maximum photo size is 500 KB.",
          "照片最大为 500 KB。",
        ),
        "error",
      );
      return;
    }
    if (preview !== null) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (profile === null || user === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      let avatar = {
        objectKey: profile.avatarObjectKey,
        contentType: profile.avatarContentType,
        size: profile.avatarSizeBytes,
      };
      if (file !== null) {
        setSaveStage("uploading");
        avatar = await uploadAvatar(file);
        await refresh();
      }
      setSaveStage("saving");
      await updateProfile({
        displayName,
        locale: profile.locale,
        avatarObjectKey: avatar.objectKey,
        avatarContentType: avatar.contentType,
        avatarSizeBytes: avatar.size,
        onboardingCompleted: user.onboardingCompletedAt !== null,
      });
      await refresh();
      await load();
      setFile(null);
      if (preview !== null) URL.revokeObjectURL(preview);
      setPreview(null);
      toast(l("Profil berhasil diperbarui.", "Profile updated.", "档案已更新。"), "success");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : l("Profil gagal disimpan.", "Could not save the profile.", "无法保存档案。");
      setSaveError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
      setSaveStage("idle");
    }
  };

  const isOwn = profile?.id === user?.id;
  return (
    <>
      <PageHeader
        eyebrow={t("profile.eyebrow")}
        title={t("profile.title")}
        description={t("profile.description")}
      />
      {loadError === null ? null : (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      <div className="profile-layout">
        <Panel
          title={t("profile.people")}
          eyebrow={`${people.length} ${l("pengguna", "users", "位用户")}`}
          className="people-panel"
        >
          <nav className="people-list">
            {people.map((person) => (
              <a
                className={person.id === profile?.id ? "active" : ""}
                href={`#/profiles/${person.id}`}
                key={person.id}
              >
                <Avatar profile={person} />
                <span>
                  <strong>{person.displayName}</strong>
                  <small>
                    {person.employeeId} · {person.role}
                  </small>
                </span>
              </a>
            ))}
          </nav>
        </Panel>
        <Panel
          title={profile?.displayName ?? t("common.loading")}
          eyebrow={profile?.role ?? "—"}
          className="profile-card-panel"
        >
          {profile === null ? null : (
            <form className="profile-form" onSubmit={submit}>
              <div className="profile-identity">
                <Avatar
                  profile={{
                    ...profile,
                    avatarUrl: preview ?? profile.avatarUrl,
                  }}
                  large
                />
                <div>
                  <h2>{profile.displayName}</h2>
                  <p>
                    {profile.employeeId} · {profile.branchName ?? "—"}
                  </p>
                </div>
              </div>
              {isOwn ? (
                <label className="avatar-upload">
                  <span>{t("profile.avatar")}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => choose(event.target.files?.[0] ?? null)}
                  />
                  <small>
                    {l(
                      "PNG/JPEG/WebP · maks. 500 KB",
                      "PNG/JPEG/WebP · max. 500 KB",
                      "PNG/JPEG/WebP · 最大 500 KB",
                    )}
                  </small>
                </label>
              ) : null}
              <dl className="profile-facts">
                <div>
                  <dt>{t("profile.employeeId")}</dt>
                  <dd>{profile.employeeId}</dd>
                </div>
                <div>
                  <dt>{t("profile.email")}</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div>
                  <dt>{t("profile.role")}</dt>
                  <dd>{profile.role}</dd>
                </div>
                <div>
                  <dt>{t("profile.branch")}</dt>
                  <dd>{profile.branchName ?? "—"}</dd>
                </div>
              </dl>
              {isOwn ? (
                <>
                  <label className="field">
                    <span>{l("Nama tampilan", "Display name", "显示名称")}</span>
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </label>
                  {saveError === null ? null : (
                    <p className="form-error" role="alert">
                      {saveError}
                    </p>
                  )}
                  <button className="button button-primary" disabled={saving}>
                    {saveStage === "uploading"
                      ? l("Mengunggah foto…", "Uploading photo…", "正在上传照片…")
                      : saveStage === "saving"
                        ? l("Menyimpan profil…", "Saving profile…", "正在保存档案…")
                        : t("profile.save")}
                  </button>
                </>
              ) : null}
            </form>
          )}
        </Panel>
        <Panel
          title={t("profile.activity")}
          eyebrow={profile?.employeeId ?? "—"}
          className="profile-activity-panel"
        >
          <ActivityLog actorId={profile?.id} />
        </Panel>
      </div>
    </>
  );
}

function Avatar({ profile, large = false }: { profile: UserProfile; large?: boolean }) {
  const { l } = useI18n();
  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return profile.avatarUrl ? (
    <img
      className={`profile-avatar ${large ? "profile-avatar-large" : ""}`}
      src={profile.avatarUrl}
      alt={l(
        `Foto ${profile.displayName}`,
        `Photo of ${profile.displayName}`,
        `${profile.displayName} 的照片`,
      )}
    />
  ) : (
    <span
      className={`profile-avatar profile-avatar-fallback ${large ? "profile-avatar-large" : ""}`}
    >
      {initials || "U"}
    </span>
  );
}
function profileIdFromHash(): string | null {
  return location.hash.match(/^#\/profiles\/([^/?]+)/)?.[1] ?? null;
}
