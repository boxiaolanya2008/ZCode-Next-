import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { SkillMarketCliStatus, SkillMarketInstallScope, SkillMarketListing } from "@zcode/shared";
import { SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { SettingsSearchInput } from "@/settings/SettingsSearchInput.js";
import { logger } from "@/logger.js";

interface SkillsMarketPanelProps {
  workspacePath?: string | null;
  workspaceIdentity?: string;
  /** 安装/更新成功后回调，用于刷新 skills store，让 `/` 命令立即发现新技能。 */
  onAfterInstall?: () => Promise<void> | void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUpdateConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE) {
    return true;
  }
  return errorMessage(error).includes(SKILL_MARKET_UPDATE_CONFLICT_ERROR_CODE);
}

/**
 * Skills 市场（SkillHub 接入）面板。
 * 只表达意图：搜索/下载/更新，外部 I/O 全部经 ISkillMarketService。
 */
export function SkillsMarketPanel({
  workspacePath,
  workspaceIdentity,
  onAfterInstall,
}: SkillsMarketPanelProps) {
  const { intl } = useZCodeIntl();
  const { skillMarketService } = useServices();
  const [cliStatus, setCliStatus] = useState<SkillMarketCliStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SkillMarketListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setCliStatus(await skillMarketService.getCliStatus());
    } catch (cause) {
      logger.warn("[skills-market] 读取 CLI 状态失败", { error: errorMessage(cause) });
    } finally {
      setStatusLoading(false);
    }
  }, [skillMarketService]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleSearch = useCallback(async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const result = await skillMarketService.search({ keyword: trimmed });
      setCliStatus(result.cli);
      setResults(result.skills);
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      logger.warn("[skills-market] 搜索失败", { error: message });
    } finally {
      setSearching(false);
    }
  }, [keyword, skillMarketService]);

  const handleDownload = useCallback(
    async (listing: SkillMarketListing) => {
      setBusyName(listing.name);
      setError(null);
      const scope: SkillMarketInstallScope = "user";
      const params = {
        name: listing.name,
        scope,
        ...(workspacePath ? { workspacePath } : {}),
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
      };
      try {
        const result = listing.installed
          ? await skillMarketService.update(params)
          : await skillMarketService.install(params);
        toast(
          intl.formatMessage(
            { id: result.updated ? "settings.skillsMarket.updateSuccess" : "settings.skillsMarket.installSuccess" },
            { name: result.name },
          ),
        );
        setResults((previous) =>
          previous
            ? previous.map((item) =>
                item.name === listing.name ? { ...item, installed: true } : item,
              )
            : previous,
        );
        await onAfterInstall?.();
      } catch (cause) {
        if (isUpdateConflict(cause)) {
          toast(
            intl.formatMessage({ id: "settings.skillsMarket.updateConflict" }, { name: listing.name }),
          );
        } else {
          toast(
            intl.formatMessage(
              { id: "settings.skillsMarket.installFailed" },
              { message: errorMessage(cause) },
            ),
          );
        }
        logger.warn("[skills-market] 下载失败", { name: listing.name, error: errorMessage(cause) });
      } finally {
        setBusyName(null);
      }
    },
    [intl, onAfterInstall, skillMarketService, workspaceIdentity, workspacePath],
  );

  const cliAvailable = cliStatus?.available ?? false;

  if (statusLoading) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "settings.skillsMarket.searching" })}
      </p>
    );
  }

  if (!cliAvailable) {
    return (
      <div
        className="space-y-3 rounded-xl border border-border bg-card px-4 py-4"
        data-testid="skills-market-cli-missing"
      >
        <div>
          <p className="text-ui-base font-medium text-foreground">
            {intl.formatMessage({ id: "settings.skillsMarket.cliMissing.title" })}
          </p>
          <p className="mt-1 text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.skillsMarket.cliMissing.description" })}
          </p>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-ui-sm text-foreground">
          {cliStatus?.installGuide ?? ""}
        </pre>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatus()}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.skillsMarket.refresh" })}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="skills-market-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-ui-base leading-6 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.skillsMarket.subtitle" })}
        </p>
        {cliStatus?.version ? (
          <span className="shrink-0 font-mono text-ui-xs text-foreground-subtlest">
            {intl.formatMessage({ id: "settings.skillsMarket.cliVersion" }, { version: cliStatus.version })}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <SettingsSearchInput
          value={keyword}
          containerClassName="flex-1"
          data-testid="skills-market-search"
          placeholder={intl.formatMessage({ id: "settings.skillsMarket.searchPlaceholder" })}
          onChange={(event) => setKeyword(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleSearch();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={searching || keyword.trim().length === 0}
          onClick={() => void handleSearch()}
        >
          {searching ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {intl.formatMessage({
            id: searching ? "settings.skillsMarket.searching" : "settings.skillsMarket.search",
          })}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-ui-base text-destructive"
          data-testid="skills-market-error"
        >
          {error}
        </p>
      ) : null}

      {results === null ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.skillsMarket.searchHint" })}
        </p>
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.skillsMarket.searchEmpty" })}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="skills-market-results">
          {results.map((listing) => {
            const busy = busyName === listing.name;
            return (
              <li
                key={listing.name}
                data-testid="skills-market-item"
                data-skill-name={listing.name}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-ui-base font-medium text-foreground">
                      {listing.name}
                    </span>
                    {listing.installed ? (
                      <span className="rounded-full bg-selected px-2 py-0.5 text-ui-xs text-foreground-subtle">
                        {intl.formatMessage({ id: "settings.skillsMarket.installedBadge" })}
                      </span>
                    ) : null}
                    {listing.hasLocalChanges ? (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-ui-xs text-warning">
                        {intl.formatMessage({ id: "settings.skillsMarket.localChanges" })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-ui-sm text-foreground-subtle">
                    {listing.description ??
                      intl.formatMessage({ id: "settings.skillsMarket.noDescription" })}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-ui-xs text-foreground-subtlest">
                    {listing.source ? (
                      <span className="truncate">
                        {intl.formatMessage(
                          { id: "settings.skillsMarket.source" },
                          { source: listing.source },
                        )}
                      </span>
                    ) : null}
                    {listing.version ? (
                      <span className="font-mono">
                        {intl.formatMessage(
                          { id: "settings.skillsMarket.version" },
                          { version: listing.version },
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant={listing.installed ? "outline" : "default"}
                  size="sm"
                  disabled={busyName !== null}
                  data-testid="skills-market-download"
                  onClick={() => void handleDownload(listing)}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-3.5" aria-hidden="true" />
                  )}
                  {intl.formatMessage({
                    id: listing.installed
                      ? "settings.skillsMarket.update"
                      : "settings.skillsMarket.install",
                  })}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
