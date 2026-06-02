"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  User,
  CreditCard,
  Bell,
  Lock,
  Link2,
  Truck,
  Key,
  Smartphone,
  Loader2,
  MessageSquare,
} from "lucide-react";
import {
  getSellerProfile,
  updateSellerProfile,
  clearTestData,
} from "@/lib/data/service";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { useToast } from "@/components/dashboard/ToastProvider";
import { PageTransition } from "@/components/ui/motion";
import { usePermissions } from "@/hooks/usePermissions";

import ProfileTab from "./_tabs/ProfileTab";
import ChannelsTab from "./_tabs/ChannelsTab";
import TemplatesTab from "./_tabs/TemplatesTab";
import BillingTab from "./_tabs/BillingTab";
import NotificationsTab from "./_tabs/NotificationsTab";
import SecurityTab from "./_tabs/SecurityTab";
import IntegrationsTab from "./_tabs/IntegrationsTab";
import DeliverySettingsTab from "./_tabs/DeliverySettingsTab";
import ApiKeysTab from "./_tabs/ApiKeysTab";

const TABS = [
  "profile",
  "channels",
  "templates",
  "billing",
  "notificationsSection",
  "security",
  "integrations",
  "deliverySettings",
  "apiKeys",
] as const;

const TAB_ICONS: Record<string, typeof User> = {
  profile: User,
  channels: Smartphone,
  templates: MessageSquare,
  billing: CreditCard,
  notificationsSection: Bell,
  security: Lock,
  integrations: Link2,
  deliverySettings: Truck,
  apiKeys: Key,
};

export default function SettingsPage() {
  const { t } = useI18n();
  const { isMobile } = useLayout();
  const { toast } = useToast();
  const { role } = usePermissions();
  const [activeTab, setActiveTab] = useState<string>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    business_name: "",
    owner_name: "",
    email: "",
  });
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    newOrders: true,
    confirmations: true,
    highRisk: true,
    lowStock: false,
    delivery: true,
    weekly: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [apiKeys, setApiKeys] = useState<{ production: string; test: string }>({
    production: "",
    test: "",
  });
  const [keyGenerating, setKeyGenerating] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState<string>("disconnected");
  const [channelLoading, setChannelLoading] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [templates, setTemplates] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      content: string;
      category: string;
      language: string;
      active: boolean;
    }>
  >([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateEditing, setTemplateEditing] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    slug: "",
    content: "",
    category: "general",
    language: "ar",
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialEmailRef = useRef<string>("");
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setQrCountdown(0);
  }

  async function checkChannelStatus() {
    try {
      const res = await fetch("/api/channels/connect", { method: "POST" });
      const data = await res.json();
      if (data.status === "connected") {
        setChannelStatus("connected");
        setQrCode(null);
        stopPolling();
        toast({ type: "success", title: t.settings.whatsappConnected });
      }
    } catch {
      /* silent */
    }
  }

  async function connectWhatsApp() {
    setChannelLoading(true);
    setQrCode(null);
    try {
      const res = await fetch("/api/channels/connect", { method: "POST" });
      const data = await res.json();
      if (data.status === "connected") {
        setChannelStatus("connected");
      } else if (data.status === "qr") {
        setQrCode(data.qrCode);
        setChannelStatus("scanning");
        stopPolling();
        setQrCountdown(45);
        pollRef.current = setInterval(() => {
          checkChannelStatus();
        }, 4000);
        countdownRef.current = setInterval(() => {
          setQrCountdown((prev) => {
            if (prev <= 1) {
              stopPolling();
              setChannelStatus("expired");
              setQrCode(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      /* silent */
    } finally {
      setChannelLoading(false);
    }
  }

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const p = await getSellerProfile();
      if (p) {
        setFormData({
          business_name: p.business_name || "",
          owner_name: p.full_name || "",
          email: p.email || "",
        });
        initialEmailRef.current = p.email || "";
        if (
          p.notification_settings &&
          typeof p.notification_settings === "object"
        ) {
          setNotifs((prev) => ({
            ...prev,
            ...(p.notification_settings as Record<string, boolean>),
          }));
        }
        if (p.webhook_token) {
          setApiKeys({
            production: p.webhook_token,
            test: `test_${p.webhook_token.slice(0, 16)}`,
          });
        }
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (activeTab === "templates") loadTemplates();
  }, [activeTab]);

  async function loadTemplates() {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      /* silent */
    } finally {
      setTemplateLoading(false);
    }
  }

  async function handleSaveTemplate() {
    setTemplateSaving(true);
    try {
      if (templateEditing) {
        const res = await fetch("/api/templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: templateEditing, ...templateForm }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.common.error);
        toast({ type: "success", title: t.settings.templateSaved });
        setTemplateEditing(null);
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.common.error);
        toast({ type: "success", title: t.settings.templateCreated });
      }
      setTemplateForm({
        name: "",
        slug: "",
        content: "",
        category: "general",
        language: "ar",
      });
      setShowTemplateForm(false);
      loadTemplates();
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      const res = await fetch("/api/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(t.common.error);
      toast({ type: "success", title: t.settings.templateDeleted });
      loadTemplates();
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    }
  }

  function handleEditTemplate(tpl: (typeof templates)[0]) {
    setTemplateEditing(tpl.id);
    setTemplateForm({
      name: tpl.name,
      slug: tpl.slug,
      content: tpl.content,
      category: tpl.category,
      language: tpl.language,
    });
  }

  async function handleToggleTemplate(id: string, active: boolean) {
    try {
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      loadTemplates();
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    }
  }

  useEffect(() => {
    if (activeTab === "channels") {
      fetch("/api/channels/connect", { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (d.status === "connected") setChannelStatus("connected");
        })
        .catch(() => {});
    }
    return () => stopPolling();
  }, [activeTab]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await updateSellerProfile({
        business_name: formData.business_name,
        full_name: formData.owner_name,
      });
      if (formData.email && formData.email !== initialEmailRef.current) {
        const supabase = createClient();
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        });
        if (emailError) throw emailError;
        initialEmailRef.current = formData.email;
        toast({
          type: "success",
          title: "Profile saved. Check your inbox to confirm the email change.",
        });
      } else {
        toast({ type: "success", title: t.common.saved });
      }
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotifications() {
    setNotifSaving(true);
    try {
      await updateSellerProfile({
        notification_settings: notifs as Record<string, boolean> & {
          newOrders: boolean;
          confirmations: boolean;
          highRisk: boolean;
          lowStock: boolean;
          delivery: boolean;
          weekly: boolean;
        },
      });
      toast({ type: "success", title: t.common.saved });
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    } finally {
      setNotifSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!passwords.new || passwords.new.length < 6) {
      setPasswordMsg({ type: "error", text: t.settings.passwordMinLength });
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      const supabase = createClient();
      // Verify current password before allowing the update
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: initialEmailRef.current || formData.email,
        password: passwords.current,
      });
      if (signInError) {
        setPasswordMsg({
          type: "error",
          text: "Incorrect current password",
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password: passwords.new,
      });
      if (error) throw error;
      setPasswordMsg({ type: "success", text: t.settings.passwordUpdated });
      setPasswords({ current: "", new: "" });
    } catch (e) {
      setPasswordMsg({
        type: "error",
        text: (e as Error).message || t.settings.passwordUpdateFailed,
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function confirmWipeData() {
    setShowWipeConfirm(false);
    setWiping(true);
    try {
      await clearTestData();
      toast({
        type: "success",
        title: t.settings.wipeSuccess || t.common.success,
      });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({ type: "error", title: (e as Error).message });
    } finally {
      setWiping(false);
    }
  }

  async function handleGenerateApiKey() {
    setKeyGenerating(true);
    try {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const newKey = `sf_${Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")}`;
      await updateSellerProfile({ webhook_token: newKey });
      setApiKeys({ production: newKey, test: `test_${newKey.slice(0, 16)}` });
    } catch {
      /* silent */
    } finally {
      setKeyGenerating(false);
    }
  }

  function handleCopyKey(key: string, label: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (loading) {
    return (
      <div
        className="sf-flex-center sf-text-secondary"
        style={{ minHeight: 400 }}
      >
        <Loader2 size={24} className="sf-animate-spin sf-mr-sm" />
        {t.common.loading}
      </div>
    );
  }

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      <div>
        <h1 className="sf-page-title">{t.settings.title}</h1>
        <p className="sf-page-subtitle">{t.settings.subtitle}</p>
      </div>

      <div
        className={`sf-flex ${isMobile ? "sf-flex-col sf-gap-md" : "sf-gap-xl"}`}
      >
        {/* Tab Nav */}
        <div
          className={isMobile ? "sf-settings-nav--mobile" : "sf-settings-nav"}
          style={isMobile ? {} : { width: 200, flexShrink: 0 }}
        >
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const label =
              t.settings[tab as keyof typeof t.settings] ||
              (tab === "channels" ? "Channels" : tab);
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`sf-settings-nav-item ${activeTab === tab ? "active" : ""} ${isMobile ? "sf-settings-nav-item--mobile" : ""}`}
              >
                <Icon size={16} className="sf-flex-shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="sf-settings-content">
          {activeTab === "profile" && (
            <ProfileTab
              formData={formData}
              setFormData={setFormData}
              saving={saving}
              onSave={handleSaveProfile}
            />
          )}
          {activeTab === "channels" && (
            <ChannelsTab
              channelStatus={channelStatus}
              qrCode={qrCode}
              qrCountdown={qrCountdown}
              channelLoading={channelLoading}
              onConnectWhatsApp={connectWhatsApp}
            />
          )}
          {activeTab === "templates" && (
            <TemplatesTab
              templates={templates}
              templateLoading={templateLoading}
              templateSaving={templateSaving}
              templateEditing={templateEditing}
              templateForm={templateForm}
              showTemplateForm={showTemplateForm}
              setTemplateEditing={setTemplateEditing}
              setTemplateForm={setTemplateForm}
              setShowTemplateForm={setShowTemplateForm}
              onSave={handleSaveTemplate}
              onDelete={handleDeleteTemplate}
              onEdit={handleEditTemplate}
              onToggle={handleToggleTemplate}
            />
          )}
          {activeTab === "billing" && <BillingTab />}
          {activeTab === "notificationsSection" && (
            <NotificationsTab
              notifs={notifs}
              setNotifs={setNotifs}
              notifSaving={notifSaving}
              onSave={handleSaveNotifications}
            />
          )}
          {activeTab === "security" && (
            <SecurityTab
              passwords={passwords}
              setPasswords={setPasswords}
              passwordSaving={passwordSaving}
              passwordMsg={passwordMsg}
              wiping={wiping}
              onPasswordChange={handlePasswordChange}
              onWipeClick={() => setShowWipeConfirm(true)}
              role={role}
            />
          )}
          {activeTab === "integrations" && <IntegrationsTab />}
          {activeTab === "deliverySettings" && <DeliverySettingsTab />}
          {activeTab === "apiKeys" && (
            <ApiKeysTab
              apiKeys={apiKeys}
              copiedKey={copiedKey}
              keyGenerating={keyGenerating}
              onCopyKey={handleCopyKey}
              onGenerate={handleGenerateApiKey}
            />
          )}
        </div>
      </div>

      {showWipeConfirm && (
        <div
          className="sf-modal-overlay"
          onClick={() => setShowWipeConfirm(false)}
        >
          <div
            className="sf-modal-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="sf-heading-sm">{t.common.confirmDelete}</h3>
            <p className="sf-text-sm-secondary sf-mt-sm">
              {t.settings.confirmWipe}
            </p>
            <div className="sf-modal-actions">
              <button
                className="sf-btn sf-btn-ghost"
                onClick={() => setShowWipeConfirm(false)}
              >
                {t.common.cancel}
              </button>
              <button
                className="sf-btn sf-btn-danger"
                onClick={confirmWipeData}
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
