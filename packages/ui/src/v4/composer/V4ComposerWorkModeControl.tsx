// composer 工作模式选择（mode list）：紧邻模型选择。
//
// 只编辑本 scope 的工作模式选择（per-session，默认编码模式）；agent 侧由所选模式
// 整段替换 system prompt，自下一轮（context 重建）生效。展示件为纯 props 组件，
// 状态由 Composer owner（useDraftConfigControl → composerWorkModeStore）持有。
import { memo } from "react";
import { CodeIcon, PaletteIcon, ShieldCheckIcon, ChevronDownIcon } from "lucide-react";
import {
  AGENT_WORK_MODES,
  DEFAULT_AGENT_WORK_MODE,
  TID_V4_WORK_MODE_SELECT_ITEM,
  TID_V4_WORK_MODE_SELECT_TRIGGER,
  TID_V4_COMPOSER_INPUT,
  testId,
  type AgentWorkModeId,
} from "@zcode/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { isCoarseTouchDevice } from "@/lib/pickerFocus.js";
import type { V4ComposerConfigPicker } from "@/v4/composer/configPickerState.js";

function resolveWorkModeIcon(id: AgentWorkModeId) {
  switch (id) {
    case "ui-design":
      return PaletteIcon;
    case "pentest-authorized":
      return ShieldCheckIcon;
    default:
      return CodeIcon;
  }
}

export interface V4ComposerWorkModeControlProps {
  workMode: AgentWorkModeId;
  onSelectWorkMode: (workMode: string) => void;
  disabled?: boolean;
  activeConfigPicker: V4ComposerConfigPicker | null;
  onConfigPickerOpenChange: (picker: V4ComposerConfigPicker, open: boolean) => void;
}

function V4ComposerWorkModeControlImpl({
  workMode,
  onSelectWorkMode,
  disabled,
  activeConfigPicker,
  onConfigPickerOpenChange,
}: V4ComposerWorkModeControlProps) {
  const { intl } = useZCodeIntl();
  const selected =
    AGENT_WORK_MODES.find((mode) => mode.id === workMode) ??
    AGENT_WORK_MODES.find((mode) => mode.id === DEFAULT_AGENT_WORK_MODE)!;
  const selectedLabel = intl.formatMessage({ id: selected.labelMessageId });
  const label = intl.formatMessage({ id: "chat.toolbar.workMode.label" });
  const SelectedIcon = resolveWorkModeIcon(selected.id);
  const open = activeConfigPicker === "workMode";

  return (
    <DropdownMenu open={open} onOpenChange={(next) => onConfigPickerOpenChange("workMode", next)}>
      <ControlHintTooltip title={label} open={open ? false : undefined}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-testid={TID_V4_WORK_MODE_SELECT_TRIGGER}
            data-work-mode-current-value={selected.id}
            aria-label={label}
            className="group/workmode size-7 gap-1 rounded-lg p-0 text-ui-base @xl/composer:w-auto @xl/composer:px-2 data-[composer-compact=true]:w-7 data-[composer-compact=true]:px-0"
          >
            <SelectedIcon className="size-4" />
            <span className="hidden @xl/composer:inline group-data-[composer-compact=true]/workmode:hidden">
              {selectedLabel}
            </span>
            <ChevronDownIcon className="hidden size-3.5 text-foreground-subtle @xl/composer:block group-data-[composer-compact=true]/workmode:hidden" />
          </Button>
        </DropdownMenuTrigger>
      </ControlHintTooltip>
      <DropdownMenuContent
        side="top"
        sideOffset={4}
        className="w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!isCoarseTouchDevice())
            document
              .querySelector<HTMLElement>(`[data-testid="${TID_V4_COMPOSER_INPUT}"]`)
              ?.focus();
        }}
      >
        <DropdownMenuRadioGroup value={selected.id} onValueChange={onSelectWorkMode}>
          {AGENT_WORK_MODES.map((mode) => {
            const ModeIcon = resolveWorkModeIcon(mode.id);
            const descriptionId = `${mode.labelMessageId}.description`;
            return (
              <DropdownMenuRadioItem
                key={mode.id}
                value={mode.id}
                data-testid={testId(TID_V4_WORK_MODE_SELECT_ITEM, mode.id)}
                className="min-h-13 items-start gap-3 py-2 text-ui-base"
              >
                <ModeIcon className="mt-0.5 size-4.5 shrink-0" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>{intl.formatMessage({ id: mode.labelMessageId })}</span>
                  <span className="text-ui-sm text-foreground-subtle">
                    {intl.formatMessage({ id: descriptionId })}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const V4ComposerWorkModeControl = memo(V4ComposerWorkModeControlImpl);
