export const iconButtonClass =
  "grid size-9 shrink-0 place-items-center rounded-[0.45rem] border border-soc5-line bg-linehaul-surface-soft text-soc5-muted transition-[color,background,border-color,transform] duration-[180ms] ease-[ease] hover:-translate-y-[.05rem] hover:border-soc5-line hover:bg-linehaul-teal-soft hover:text-linehaul-teal-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] disabled:cursor-not-allowed disabled:opacity-[.62] motion-reduce:transition-none";

export const textButtonClass =
  "border-0 bg-transparent px-[.35rem] py-[.2rem] text-sm font-medium text-linehaul-lime-ink transition-colors hover:text-linehaul-lime-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#71820e] motion-reduce:transition-none";

export const toastClass =
  "fixed top-[4.4rem] right-4 z-[70] flex w-[min(16.5rem,calc(100vw_-_1.5rem))] gap-[.45rem] rounded-[.55rem] border border-soc5-line bg-soc5-panel px-[.65rem] py-[.55rem] text-soc5-ink shadow-[0_.6rem_1.4rem_rgb(28_29_30_/_14%)]";

export const toastContentClass = "grid min-w-0 gap-[.1rem]";
export const toastTitleClass = "text-sm font-semibold";
export const mutedCaptionClass = "text-xs text-soc5-muted";
export const toastBodyClass = mutedCaptionClass;

export const dashboardViewClass =
  "workspace-view dashboard-view text-soc5-ink min-h-[calc(100dvh_-_3.8rem)] w-full min-w-0 overflow-wrap-anywhere bg-[radial-gradient(circle_at_96%_2%,rgb(214_250_45_/_11%),transparent_27.733333rem),var(--soc5-page)] px-[var(--app-page-gutter)] pt-[clamp(1.25rem,1.5vw,1.75rem)] pb-[clamp(3rem,5vw,5rem)] max-[960px]:px-[.8rem] max-[960px]:pt-[.8rem] max-[960px]:pb-16 max-[480px]:px-2 dark:bg-none dark:bg-soc5-page";
export const workspaceViewClass =
  "workspace-view text-soc5-ink relative z-[3] flex min-h-0 w-full max-w-full min-w-0 flex-1 px-[var(--app-page-gutter)]";

export const overviewMetricsClass =
  "overview-metrics order-2 grid min-w-0 grid-cols-2 gap-[clamp(.533333rem,.75vw,.8rem)] overflow-hidden rounded-[.9rem] border border-soc5-line bg-linehaul-surface-soft p-[clamp(.4rem,.5vw,.533333rem)] max-[600px]:gap-[.6rem]";

export const scorecardsLayoutClass =
  "scorecards-layout grid min-w-0 gap-[clamp(1.066667rem,1.5vw,1.6rem)] mb-[.6rem] min-[1280px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] max-[960px]:grid-cols-1";
export const timingMetricsClass =
  "grid min-w-0 grid-cols-2 gap-[clamp(.7rem,1.1vw,1rem)] mb-[clamp(1rem,1.5vw,1.4rem)] max-[600px]:grid-cols-1";

export const dashboardGridClass =
  "dashboard-grid grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,23.466667rem),1fr))] gap-[clamp(.8rem,1.25vw,1.333333rem)] max-[820px]:grid-cols-1";

export const requestPageClass =
  "workspace-view lh-request-page flex min-h-0 min-w-0 h-full flex-1 flex-col overflow-visible px-[var(--app-page-gutter)] pt-[.9rem] pb-[1.4rem] font-body text-soc5-ink antialiased max-[820px]:min-h-0 max-[820px]:h-auto max-[680px]:pt-[.6rem] max-[680px]:pb-4";

export const requestWorkspaceClass =
  "lh-request-workspace flex h-full min-h-0 min-w-0 w-full max-w-[78rem] flex-1 flex-col gap-[.7rem] mx-auto max-[820px]:min-h-0 max-[820px]:h-auto max-[680px]:gap-2";

export const tableShellClass =
  "lh-table-shell grid min-h-[21rem] min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_2.4rem] overflow-hidden rounded-[.6rem] border border-soc5-line bg-soc5-panel shadow-[0_.05rem_.1rem_rgb(15_42_43_/_3%),0_.5rem_1.2rem_rgb(15_42_43_/_4%)] transition-[box-shadow] duration-180 max-[820px]:min-h-[26rem] max-[680px]:min-h-[28rem] max-[680px]:grid-rows-[auto_minmax(0,1fr)_2.3rem] motion-reduce:transition-none";

export const recordsScrollClass =
  "lh-records-table-scroll min-h-0 min-w-0 w-full max-w-full overflow-x-auto overflow-y-auto overscroll-contain [scrollbar-width:thin]";
export const genericTableWrapClass =
  "table-wrap request-table-wrap min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]";
export const genericTableScrollClass =
  "request-table-scroll min-h-0 min-w-0 w-full max-w-full max-h-[min(68vh,36rem)] overflow-hidden [&_[data-radix-scroll-area-viewport]]:h-full";
export const requestDetailDialogClass = "request-detail-dialog w-[min(59rem,100%)]";
export const requestDetailContentClass =
  "mx-[.7rem] mb-[.7rem] grid min-h-[11rem] place-content-center justify-items-center rounded-[.7rem] border border-dashed border-soc5-line bg-linehaul-surface-soft px-6 py-10 text-center max-[640px]:min-h-[8.5rem] max-[640px]:px-4 max-[640px]:py-8";
export const requestDetailTitleClass = "text-sm font-semibold text-soc5-ink";
export const requestDetailCopyClass = "mt-1 max-w-sm text-xs leading-5 text-soc5-muted";

export const recordsTableClass =
  "lh-records-table grid min-h-0 w-max min-w-full grid-cols-[repeat(11,minmax(5.6rem,max-content))] grid-rows-[2.4rem_minmax(0,1fr)] overflow-visible rounded-[.6rem] border border-soc5-line bg-soc5-panel tabular-nums";

export const requestToolbarIconClass =
  "inline-flex size-[1.8rem] shrink-0 cursor-pointer items-center justify-center rounded-[.4rem] border border-soc5-line bg-soc5-panel p-0 text-soc5-muted transition-[color,background,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-soc5-line hover:bg-linehaul-surface-soft hover:text-soc5-ink hover:shadow-[0_.15rem_.4rem_rgb(15_42_43_/_10%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep disabled:cursor-not-allowed disabled:opacity-60 aria-[pressed=true]:border-[#a2c500] aria-[pressed=true]:bg-linehaul-lime-surface aria-[pressed=true]:text-linehaul-lime-ink motion-reduce:transition-none";

export const requestActionClass =
  "inline-flex min-h-[1.8rem] cursor-pointer items-center justify-center rounded-[.4rem] border border-transparent px-[.65rem] text-sm font-semibold leading-none text-white shadow-[0_.1rem_.25rem_rgb(25_45_45_/_16%),inset_0_.05rem_0_rgb(255_255_255_/_22%)] transition-[background,border-color,box-shadow,transform] duration-180 hover:-translate-y-[.05rem] hover:shadow-[0_.25rem_.5rem_rgb(25_45_45_/_20%),inset_0_.05rem_0_rgb(255_255_255_/_22%)] active:translate-y-0 active:shadow-[0_.05rem_.15rem_rgb(25_45_45_/_18%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f78] disabled:cursor-not-allowed disabled:opacity-[.58] disabled:hover:translate-y-0 motion-reduce:transition-none";

export const requestApproveClass = `${requestActionClass} border-[#1f6b3a] bg-[linear-gradient(180deg,#2e8a4b,#247641)] hover:bg-[linear-gradient(180deg,#257a40,#1b6034)]`;
export const requestAssignClass = `${requestActionClass} border-[#145f88] bg-[linear-gradient(180deg,#258abf,#1976a8)] hover:bg-[linear-gradient(180deg,#1d79a7,#145e87)]`;
export const requestRejectClass = `${requestActionClass} border-[#a83240] bg-[linear-gradient(180deg,#cf5260,#bd3d4a)] hover:bg-[linear-gradient(180deg,#b84350,#982f3a)]`;

export const dialogHeadClass =
  "flex shrink-0 items-center justify-between gap-4 border-b border-soc5-line bg-[linear-gradient(180deg,#fff,#f8fbfa)] px-[1.1rem] py-[.9rem] dark:bg-none dark:bg-soc5-panel";
export const dialogActionsClass =
  "mt-[1.1rem] flex items-center justify-end gap-2 border-t border-soc5-line pt-[.9rem] max-[600px]:items-stretch max-[600px]:flex-wrap";
export const tableActionClass =
  "inline-flex min-h-[1.7rem] items-center justify-center gap-[.3rem] rounded-[.3rem] border border-soc5-line bg-soc5-panel px-2 text-sm font-medium text-soc5-ink transition-[background,border-color,color,transform] duration-150 hover:border-soc5-line hover:bg-linehaul-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep disabled:cursor-not-allowed disabled:opacity-60";
export const primaryTableActionClass = `${tableActionClass} border-soc5-lime-deep bg-soc5-lime-deep text-white hover:border-[#405000] hover:bg-[#405000]`;

export const formDialogClass =
  "flex max-h-[min(38rem,calc(100dvh-1.6rem))] w-[min(55rem,100%)] flex-col overflow-hidden rounded-[.9rem] border border-soc5-line bg-soc5-panel shadow-[0_1.4rem_4rem_rgb(14_23_38_/_28%),0_.2rem_.9rem_rgb(14_23_38_/_10%)] animate-[dialog-panel-in_.34s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none max-[640px]:max-h-[calc(100dvh-1.2rem)] max-[640px]:rounded-2xl";
export const compactFormDialogClass = `${formDialogClass} w-[min(26rem,100%)]`;
export const dialogFormClass =
  "min-h-0 overflow-auto px-[1.1rem] py-[1.1rem] max-[640px]:px-4";
export const dialogLabelClass =
  "mb-4 grid gap-[.35rem] text-sm font-medium text-soc5-ink";
export const dialogInputClass =
  "min-h-[2.1rem] w-full rounded-[.5rem] border border-soc5-line bg-linehaul-surface-soft px-3 py-[.5rem] text-sm text-soc5-ink outline-none transition-[border-color,box-shadow,background] duration-180 placeholder:text-soc5-muted hover:border-soc5-line focus:border-[#14b8a6] focus:bg-soc5-panel focus:outline-none focus:ring-[.2rem] focus:ring-[rgb(20_184_166_/_14%)] motion-reduce:transition-none";
export const dialogTextareaClass = `${dialogInputClass} min-h-[5.2rem] resize-y`;
export const secondaryButtonClass =
  "inline-flex min-h-[1.8rem] cursor-pointer items-center justify-center gap-[.35rem] rounded-[.4rem] border border-soc5-line bg-soc5-panel px-[.65rem] text-sm font-medium text-soc5-ink transition-[background,border-color,color,transform] duration-150 hover:-translate-y-px hover:border-soc5-line hover:bg-linehaul-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
export const formErrorClass =
  "mx-[1.1rem] rounded-[.5rem] border border-soc5-line bg-status-danger-surface px-[.6rem] py-2 text-sm leading-snug text-status-danger-ink max-[640px]:mx-0";

export const usersPageClass =
  "workspace-view min-h-full w-full min-w-0 overflow-wrap-anywhere bg-[radial-gradient(circle_at_96%_0,rgb(214_250_45_/_13%),transparent_29.866667rem),linear-gradient(180deg,#f6faf8_0%,var(--soc5-page)_23.466667rem)] px-[var(--app-page-gutter)] pt-[clamp(1.5rem,2.5vw,2.5rem)] pb-[clamp(3rem,6vw,6rem)] max-[760px]:py-[1.1rem] max-[760px]:pb-8 dark:bg-none dark:bg-soc5-page";
export const usersSummaryClass =
  "mx-auto mb-[.9rem] grid w-full max-w-[74rem] grid-cols-3 gap-[.7rem] max-[760px]:grid-cols-1 max-[760px]:gap-[.4rem]";
export const usersSummaryCardClass =
  "flex min-h-[4.1rem] items-center gap-[.55rem] rounded-[.7rem] border border-soc5-line bg-soc5-panel px-[.85rem] py-3 shadow-[0_.5rem_1.2rem_rgb(16_43_44_/_4%)] max-[760px]:min-h-[3.4rem]";
export const usersSummaryIconClass =
  "grid size-[1.9rem] shrink-0 place-items-center rounded-[.6rem] bg-linehaul-teal-soft text-linehaul-teal-ink";
export const usersSummaryMetaClass = "grid gap-[.05rem]";
export const usersTablePanelClass =
  "mx-auto w-full max-w-[74rem] overflow-hidden rounded-[.85rem] border border-soc5-line bg-soc5-panel shadow-[0_.8rem_1.6rem_rgb(16_43_44_/_6%)]";
export const usersToolbarClass =
  "flex items-center justify-between gap-4 border-b border-soc5-line bg-soc5-panel px-[1.05rem] py-[.95rem] max-[760px]:items-stretch max-[760px]:flex-col max-[760px]:p-3";
export const usersToolbarActionsClass =
  "flex items-center justify-end gap-2 max-[760px]:items-stretch max-[760px]:flex-col";
export const usersSearchClass =
  "flex min-h-[1.9rem] w-[min(100%,15.5rem)] items-center gap-[.4rem] rounded-[.5rem] border border-soc5-line bg-soc5-panel px-[.6rem] text-soc5-muted transition-[border-color,box-shadow] duration-180 focus-within:border-[#75bdb8] focus-within:ring-2 focus-within:ring-[rgb(8_127_124_/_8%)] max-[760px]:w-full";
export const usersPrimaryActionClass =
  "inline-flex min-h-[2.1rem] cursor-pointer items-center gap-[.35rem] whitespace-nowrap rounded-[.5rem] border border-[#087f7c] bg-[#087f7c] px-[.8rem] text-sm font-semibold text-white shadow-[0_.4rem_.9rem_rgb(8_127_124_/_16%)] transition-[background,transform] duration-180 hover:-translate-y-px hover:bg-[#066965] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f7c] max-[760px]:justify-center motion-reduce:transition-none";
export const usersTableClass = "request-table min-w-[41rem] max-w-none";
export const usersIdentityClass = "flex min-w-[10.5rem] items-center gap-[.55rem]";
export const usersAvatarClass =
  "grid size-[1.8rem] shrink-0 place-items-center rounded-[.6rem] border border-soc5-line bg-[linear-gradient(145deg,#effbf9,#e2f5f2)] text-xs font-semibold text-linehaul-teal-ink dark:bg-none dark:bg-soc5-panel";
export const usersRoleSelectClass =
  "min-h-[1.6rem] max-w-32 rounded-[.4rem] border border-soc5-line bg-soc5-panel px-2 text-sm font-medium text-soc5-ink outline-none focus:border-[#75bdb8] focus:ring-2 focus:ring-[rgb(8_127_124_/_8%)]";
export const usersActiveStatusClass =
  "inline-flex items-center gap-[.3rem] text-xs font-semibold text-linehaul-teal-ink";
export const usersDisabledStatusClass =
  "inline-flex items-center gap-[.3rem] text-xs font-semibold text-soc5-muted";
export const usersTableStateClass =
  "grid min-h-[11rem] place-items-center content-center gap-1 p-6 text-center text-soc5-muted";

export const inlineCreateShellClass =
  "relative z-[4] min-w-0 max-h-[26rem] overflow-visible rounded-[.4rem] border border-soc5-line border-l-2 border-l-soc5-lime-deep bg-linehaul-surface-soft p-[.6rem] shadow-[0_.1rem_.4rem_rgb(37_42_26_/_6%)]";
export const inlineCreateFormClass =
  "grid grid-cols-[minmax(7rem,1.2fr)_repeat(4,minmax(4.5rem,.8fr))_minmax(5.5rem,1fr)_auto] items-end gap-2 max-[1120px]:grid-cols-3 max-[820px]:grid-cols-2 max-[680px]:grid-cols-1";
export const inlineCreateLabelClass =
  "relative grid min-w-0 gap-[.3rem] text-sm font-medium text-soc5-ink";
export const inlineCreateInputClass =
  "h-[1.8rem] min-w-0 rounded-[.3rem] border border-soc5-line bg-soc5-panel px-[.45rem] text-sm leading-snug text-soc5-ink outline-none transition-colors hover:border-soc5-line focus:border-soc5-lime-deep focus:ring-2 focus:ring-[rgb(162_197_0_/_18%)] read-only:bg-linehaul-surface-soft read-only:text-soc5-muted";
export const inlineSuggestionsClass =
  "absolute inset-x-0 top-[calc(100%+.25rem)] z-[8] grid gap-[.1rem] rounded-[.35rem] border border-soc5-line bg-soc5-panel p-1 shadow-[0_.4rem_1rem_rgb(32_32_34_/_14%)]";
export const inlineSuggestionClass =
  "grid min-h-8 cursor-pointer gap-[.15rem] rounded-[.25rem] border-0 bg-transparent px-[.4rem] py-[.35rem] text-left text-soc5-ink hover:bg-linehaul-surface-soft data-[headlessui-state~='active']:bg-linehaul-surface-soft";
export const inlineActionsClass =
  "flex gap-[.3rem] max-[1120px]:col-span-full max-[680px]:col-auto";
export const inlinePrimaryButtonClass =
  "inline-flex min-h-[1.8rem] cursor-pointer items-center justify-center gap-[.3rem] rounded-[.3rem] border border-soc5-lime bg-soc5-lime px-2 text-sm font-medium leading-none text-soc5-on-lime whitespace-nowrap hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55";

export const requestTableHeadClass =
  "lh-table-head col-span-full sticky top-0 z-[4] grid min-h-[2.4rem] grid-cols-subgrid items-center border-b border-soc5-line bg-[linear-gradient(180deg,rgb(247_249_247_/.98),rgb(241_246_245_/.96))] text-xs font-semibold leading-tight text-soc5-ink [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:px-[.6rem] [&>span]:flex [&>span]:items-center [&>span]:justify-center [&>button]:grid [&>button]:h-full [&>button]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] [&>button]:items-center [&>button]:gap-[.35rem] [&>button]:border-0 [&>button]:bg-transparent [&>button]:font-inherit [&>button]:text-inherit [&>button]:cursor-pointer [&>button:hover]:bg-[rgb(15_42_43_/_3%)] [&>:first-child]:sticky [&>:first-child]:left-0 [&>:first-child]:z-[8] [&>:first-child]:bg-linehaul-surface-soft [&>:first-child]:shadow-[.3rem_0_.5rem_-.5rem_rgb(15_42_43_/_65%)] [&>:last-child]:sticky [&>:last-child]:right-0 [&>:last-child]:z-[8] [&>:last-child]:bg-linehaul-surface-soft [&>:last-child]:shadow-[-.3rem_0_.5rem_-.5rem_rgb(15_42_43_/_65%)] dark:bg-none dark:bg-soc5-panel";
export const requestTableBodyClass =
  "lh-table-body col-span-full grid min-h-0 grid-cols-subgrid grid-flow-row auto-rows-min content-start overflow-visible bg-[linear-gradient(180deg,rgb(255_255_255_/.95),rgb(245_250_248_/.94))] dark:bg-none dark:bg-soc5-panel";
export const requestRowClass =
  "lh-table-row col-span-full relative grid min-h-[2.5rem] cursor-pointer grid-cols-subgrid items-center border-b border-soc5-line bg-soc5-panel text-sm font-medium text-soc5-ink transition-[background,box-shadow,transform] duration-120 hover:z-[1] hover:-translate-y-px hover:bg-linehaul-lime-surface hover:shadow-[inset_.15rem_0_0_#a2c500] focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(162_197_0_/_15%)] [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:px-[.6rem] [&>*]:py-[.3rem] [&>*]:text-ellipsis [&>span]:flex [&>span]:min-h-full [&>span]:items-center [&>span]:text-sm [&>button]:flex [&>button]:min-h-full [&>button]:items-center [&>button]:py-[.3rem] [&>*+*]:border-l [&>*+*]:border-l-soc5-line [&>:first-child]:sticky [&>:first-child]:left-0 [&>:first-child]:z-[6] [&>:first-child]:bg-soc5-panel [&>:first-child]:shadow-[.3rem_0_.5rem_-.5rem_rgb(15_42_43_/_65%)] [&>:last-child]:sticky [&>:last-child]:right-0 [&>:last-child]:z-[6] [&>:last-child]:bg-soc5-panel [&>:last-child]:shadow-[-.3rem_0_.5rem_-.5rem_rgb(15_42_43_/_65%)] max-[680px]:min-h-[2.3rem]";
export const requestExpandedRowClass =
  "bg-linehaul-surface-soft shadow-[inset_.15rem_0_0_#a2c500] hover:bg-linehaul-surface-soft";
export const requestSelectedRowClass = "bg-linehaul-teal-soft shadow-[inset_.15rem_0_0_#0b7f78] hover:bg-linehaul-teal-soft focus-visible:bg-linehaul-teal-soft";
export const compactRequestRowClass = "min-h-[2.1rem] [&>span]:py-[.2rem] [&>button]:py-[.2rem] [&>div]:py-[.2rem]";
export const requestDrawerBackdropClass =
  "fixed inset-0 z-[100000] bg-[rgb(12_25_25_/_18%)] backdrop-blur-[2px]";
export const requestDrawerClass =
  "fixed top-[3.8rem] right-0 bottom-0 z-[100001] flex w-[min(28rem,100vw)] flex-col overflow-y-auto border-l border-soc5-line bg-soc5-panel p-5 shadow-[-1rem_0_2.5rem_rgb(14_23_38_/_18%)] animate-[dialog-panel-in_.2s_ease-out_both] motion-reduce:animate-none max-[600px]:w-full max-[600px]:p-4";
export const requestDrawerHeaderClass =
  "flex items-start justify-between gap-4 border-b border-soc5-line pb-4";
export const requestDrawerCloseClass = `${iconButtonClass} size-8`;
export const requestDrawerProfileClass =
  "mt-4 flex items-center gap-3 rounded-[.7rem] border border-soc5-line bg-linehaul-surface-soft p-3";
export const requestDrawerAvatarClass =
  "grid size-10 shrink-0 place-items-center rounded-[.7rem] bg-linehaul-teal-soft text-sm font-semibold text-linehaul-teal-ink";
export const requestDrawerFieldsClass =
  "mt-5 grid grid-cols-2 gap-3 max-[460px]:grid-cols-1 [&>div]:grid [&>div]:gap-1 [&_dt]:text-xs [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-wider [&_dt]:text-soc5-muted [&_dd]:m-0 [&_dd]:text-xs [&_dd]:font-semibold [&_dd]:text-soc5-ink";
export const requestSkeletonClass =
  "lh-table-skeleton col-span-full grid min-w-0 w-full max-w-full grid-cols-subgrid overflow-hidden [&_.lh-table-row]:pointer-events-none [&_.lh-table-row>span]:self-center";
export const requestSkeletonRowClass =
  "lh-table-row lh-table-grid grid min-w-0 min-h-[2.5rem] grid-cols-subgrid items-center border-b border-soc5-line bg-soc5-panel pointer-events-none";
export const requestSkeletonCellClass =
  "lh-skeleton-cell flex min-w-0 min-h-full items-center gap-[.4rem] overflow-hidden [&:last-child]:justify-center";
export const rowMenuWrapClass = "relative flex h-full items-center justify-center overflow-visible";
export const rowMenuClass =
  "lh-row-menu fixed z-[100002] flex w-[7.4rem] flex-col gap-[.1rem] rounded-[.5rem] border border-soc5-line bg-soc5-panel p-[.3rem] shadow-[0_.7rem_1.4rem_rgb(15_42_43_/_16%),0_.1rem_.3rem_rgb(15_42_43_/_8%)] [&>button]:flex [&>button]:min-h-[1.8rem] [&>button]:cursor-pointer [&>button]:items-center [&>button]:gap-[.4rem] [&>button]:rounded-[.35rem] [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-xs [&>button]:font-medium [&>button]:leading-tight [&>button]:text-soc5-ink [&>button:hover]:bg-linehaul-lime-surface [&>button:hover]:text-linehaul-lime-ink [&>button:focus-visible]:bg-linehaul-lime-surface [&>button:focus-visible]:text-linehaul-lime-ink [&>button:focus-visible]:outline [&>button:focus-visible]:outline-2 [&>button:focus-visible]:outline-[#a2c500]";
export const rowMenuItemClass =
  "flex min-h-[1.8rem] cursor-pointer items-center gap-[.4rem] rounded-[.35rem] border-0 bg-transparent px-2 text-left text-xs font-medium leading-tight text-soc5-ink transition-colors hover:bg-linehaul-lime-surface hover:text-linehaul-lime-ink focus-visible:bg-linehaul-lime-surface focus-visible:text-linehaul-lime-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a2c500] focus-visible:-outline-offset-2 motion-reduce:transition-none";
export const requestViewToggleClass =
  "inline-flex items-center gap-[.1rem] rounded-[.35rem] border border-soc5-line bg-linehaul-surface-soft p-[.1rem] [&>button]:size-6 [&>button]:rounded-[.2rem] [&>button:hover]:border-transparent [&>button:hover]:transform-none [&>button[aria-pressed=true]]:bg-soc5-panel [&>button[aria-pressed=true]]:text-soc5-ink [&>button[aria-pressed=true]]:shadow-[0_.05rem_.15rem_rgb(37_37_39_/_10%)]";
export const selectedRequestActionsClass =
  "inline-flex items-center gap-[.4rem] border-r border-soc5-line pr-2 mr-1";
export const selectedRequestLabelClass =
  "whitespace-nowrap text-xs font-bold text-soc5-muted";
export const requestCheckboxClass =
  "size-[.85rem] shrink-0 cursor-pointer accent-[#0b7f78]";
export const loadingShellClass =
  "w-full min-w-0 max-w-full overflow-hidden rounded-card border border-card-line bg-card-surface p-3";
export const loadingToolbarClass =
  "mb-3 flex min-h-6 items-center justify-between gap-2 border-b border-soc5-line pb-2";
export const loadingChipClass =
  "block h-2.5 w-16 rounded-full bg-[linear-gradient(90deg,var(--color-skeleton-base)_0%,var(--color-skeleton-highlight)_48%,var(--color-skeleton-base)_100%)] bg-[length:220%_100%] animate-skeleton-shimmer motion-reduce:animate-none";
export const usersLoadingClass = "grid gap-0 px-3";
export const usersLoadingRowClass =
  "grid min-h-[2.9rem] grid-cols-[1.6fr_1.2fr_1fr_.8fr] items-center gap-3 border-b border-soc5-line";
export const usersDialogClass =
  "w-[min(100%_-_1.6rem,22rem)] rounded-[.9rem] border border-soc5-line shadow-[0_1.2rem_3.5rem_rgb(18_45_46_/_18%)]";
export const usersPageKickerClass =
  "mb-[.37rem] text-xs font-semibold text-linehaul-teal-ink";
export const usersDialogCopyClass = "text-xs leading-relaxed text-soc5-muted";
export const usersResetIdentityClass =
  "mx-[1.1rem] mt-4 flex items-center gap-[.55rem] rounded-[.6rem] border border-soc5-line bg-linehaul-surface-soft px-[.7rem] py-[.6rem]";
export const usersResetIconClass =
  "grid size-[1.9rem] shrink-0 place-items-center rounded-[.55rem] bg-linehaul-teal-soft text-linehaul-teal-ink";
export const usersResetLabelClass =
  "text-xs font-semibold text-soc5-muted";
export const usersResetCopyClass = "mt-[.7rem] text-xs leading-relaxed text-soc5-muted";
export const usersResetConfirmClass =
  "inline-flex min-h-[1.8rem] cursor-pointer items-center justify-center rounded-[.4rem] border border-[#087f7c] bg-[#087f7c] px-3 text-sm font-semibold text-white shadow-[0_.3rem_.7rem_rgb(8_127_124_/_16%)] transition-colors hover:bg-[#066965] disabled:cursor-not-allowed disabled:opacity-60";
export const usersTableHeadCellClass =
  "bg-linehaul-surface-soft px-3 py-[.7rem] text-xs font-semibold text-soc5-muted";
export const usersTableCellClass = "px-3 py-[.7rem] text-sm text-soc5-ink";

export const dashboardPanelClass =
  "min-w-0 overflow-hidden rounded-card border border-card-line bg-card-surface shadow-card";
export const dashboardPanelHeadClass =
  "flex items-start justify-between gap-3 px-3.5 pt-3.5";
export const dashboardPanelKickerClass =
  "mb-[3px] text-xs font-semibold tracking-wide text-linehaul-lime-ink uppercase";
export const dashboardPanelBodyClass = "min-w-0 px-3.5 pt-3 pb-3.5";
export const loginShineButtonClass =
  "relative overflow-hidden after:absolute after:inset-y-0 after:left-[-70%] after:w-[45%] after:skew-x-[-22deg] after:bg-[linear-gradient(90deg,transparent,rgb(255_255_255_/_32%),transparent)] after:transition-[left] after:duration-[650ms] after:ease-[ease] after:pointer-events-none after:content-[''] hover:after:left-[125%]";
export const loginModalLayerClass =
  "fixed inset-0 z-[100] grid place-items-center overflow-x-hidden overflow-y-auto bg-[rgb(13_23_48_/_22%)] p-[clamp(.5rem,2vw,1rem)] backdrop-blur-[.4rem] backdrop-saturate-[.86] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgb(255_255_255_/_10%)_.05rem,transparent_.05rem),linear-gradient(90deg,rgb(255_255_255_/_10%)_.05rem,transparent_.05rem)] before:bg-[length:2.6rem_2.6rem] before:opacity-[.12] max-[720px]:p-[.5rem]";
export const loginModalCardClass =
  "relative w-[min(36rem,100%)] max-lg:max-w-[28rem] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[.9rem] border border-white/20 bg-auth-surface text-auth-ink shadow-[0_1.5rem_3.5rem_-1.4rem_rgb(14_24_54_/_65%)] opacity-0 translate-y-[.6rem] transition-[opacity,transform] duration-[420ms,520ms] ease-[ease,cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none motion-reduce:transform-none";
export const requestControlsClass =
  "mx-auto w-full max-w-[74rem] min-w-0 rounded-t-[.75rem] border border-soc5-line bg-soc5-panel px-3 py-[.65rem]";
export const requestStatusTabsClass =
  "flex max-w-full gap-[.3rem] overflow-x-auto pb-1 [scrollbar-width:thin]";
export const requestStatusTabClass =
  "inline-flex min-h-[1.6rem] shrink-0 items-center gap-[.3rem] whitespace-nowrap rounded-full border border-soc5-line bg-soc5-panel px-2 text-xs text-soc5-muted hover:border-[#b6d41b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep";
export const requestStatusTabActiveClass =
  "border-[#b6d41b] bg-linehaul-lime-surface text-linehaul-lime-ink";
export const requestStatusBadgeClass =
  "grid min-w-[.9rem] h-[.9rem] place-items-center rounded-full bg-linehaul-surface-soft px-[.2rem] text-xs font-bold text-soc5-muted";
export const requestStatusBadgeActiveClass = "bg-soc5-lime text-soc5-on-lime";
export const requestToolbarClass =
  "mt-[.6rem] flex flex-wrap items-center gap-[.4rem] max-[720px]:grid max-[720px]:grid-cols-2 max-[480px]:grid-cols-1";
export const requestSearchClass =
  "flex min-w-0 flex-[1_1_11rem] h-[1.9rem] items-center gap-[.35rem] rounded-[.45rem] border border-soc5-line bg-soc5-panel px-2 text-xs text-soc5-muted focus-within:border-[#b6d41b] focus-within:ring-2 focus-within:ring-[rgb(182_212_27_/_18%)] max-[720px]:col-span-full max-[480px]:col-auto";
export const requestFilterClass =
  "flex min-w-0 h-[1.9rem] flex-[0_1_8.5rem] items-center gap-[.35rem] rounded-[.45rem] border border-soc5-line bg-soc5-panel px-2 text-xs text-soc5-muted focus-within:border-[#b6d41b] focus-within:ring-2 focus-within:ring-[rgb(182_212_27_/_18%)] max-[720px]:w-full";
export const requestControlActionsClass = "flex shrink-0 gap-[.35rem] max-[720px]:w-full max-[720px]:justify-end max-[480px]:[&>*]:flex-1";
export const requestExportButtonClass =
  "inline-flex min-h-[1.9rem] cursor-pointer items-center gap-[.3rem] rounded-[.45rem] border border-[#252527] bg-[#252527] px-[.55rem] text-xs font-bold text-white hover:bg-[#4a4a4c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep disabled:cursor-wait disabled:opacity-60";
export const genericRequestTableClass = "w-full min-w-[49rem] border-collapse table-auto tabular-nums";
export const genericRequestTableHeadCellClass = "min-w-0 border-b border-soc5-line bg-linehaul-surface-soft px-[.45rem] py-2 text-left text-xs font-semibold text-soc5-muted align-middle whitespace-nowrap";
export const genericRequestTableCellClass = "min-w-0 overflow-hidden border-b border-soc5-line px-[.45rem] py-2 text-sm text-left text-soc5-ink align-middle break-normal";
export const genericRequestTableRowClass = "hover:bg-linehaul-surface-soft last:[&>td]:border-b-0";
export const genericRequestSortButtonClass = "inline-flex items-center gap-[.3rem] whitespace-nowrap bg-transparent p-0 font-inherit text-inherit hover:text-soc5-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soc5-lime-deep";
export const genericRequestHeaderLabelClass = "inline-flex items-center gap-[.3rem]";
export const genericRequestDetailGridClass = "grid w-full min-w-0 max-w-full grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] gap-3 overflow-x-hidden bg-linehaul-surface-soft p-3 max-[720px]:grid-cols-2 max-[480px]:grid-cols-1";
export const genericRequestDetailCardClass = "min-w-0 rounded-[.45rem] border border-soc5-line bg-soc5-panel px-[.6rem] py-2 shadow-[0_.1rem_.3rem_rgb(43_61_47_/_5%)]";
export const genericRequestDetailLabelClass = "block overflow-hidden text-xs font-bold uppercase tracking-wider text-soc5-muted text-ellipsis";
export const genericRequestDetailValueClass = "block min-w-0 break-words text-xs font-semibold text-soc5-ink";

export const changePasswordPageClass =
  "grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_10%_0,rgb(214_250_45_/_14%),transparent_28rem),linear-gradient(180deg,#f6faf8_0%,var(--soc5-page)_100%)] px-4 py-8 text-soc5-ink dark:bg-none dark:bg-soc5-page";
export const changePasswordCardClass =
  "w-full max-w-[30rem] rounded-[1rem] border border-soc5-line bg-soc5-panel p-7 shadow-[0_1.4rem_4rem_rgb(14_23_38_/_14%),0_.2rem_.9rem_rgb(14_23_38_/_7%)] max-[640px]:p-5";
export const changePasswordFormClass = "mt-6 grid gap-4";
export const changePasswordLabelClass =
  "grid gap-[.4rem] text-sm font-medium text-soc5-ink";
export const changePasswordInputClass =
  "min-h-[2.5rem] w-full rounded-[.5rem] border border-soc5-line bg-linehaul-surface-soft px-3 py-2 text-sm text-soc5-ink outline-none transition-[border-color,box-shadow,background] duration-180 placeholder:text-soc5-muted hover:border-soc5-line focus:border-[#14b8a6] focus:bg-soc5-panel focus:outline-none focus:ring-[.2rem] focus:ring-[rgb(20_184_166_/_14%)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
export const changePasswordSubmitClass =
  "inline-flex min-h-[2.5rem] w-full cursor-pointer items-center justify-center rounded-[.5rem] border border-[#087f7c] bg-[#087f7c] px-4 text-sm font-semibold text-white shadow-[0_.4rem_.9rem_rgb(8_127_124_/_16%)] transition-[background,transform] duration-180 hover:-translate-y-px hover:bg-[#066965] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f7c] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
export const operationalPanelClass =
  "min-w-0 overflow-hidden rounded-[.85rem] border border-soc5-line bg-soc5-panel shadow-[0_.8rem_1.6rem_rgb(16_43_44_/_6%)]";
export const operationalPanelHeadClass =
  "flex items-center justify-between gap-4 border-b border-soc5-line bg-soc5-panel px-4 py-3";
export const operationalPanelTitleClass =
  "m-0 text-sm font-semibold text-soc5-ink";
export const operationalPanelCopyClass = "mt-[.2rem] text-sm text-soc5-muted";

export const intradayShellClass =
  "intraday-shell order-1 mb-[.7rem] min-w-0 overflow-hidden rounded-[.8rem] border border-soc5-line bg-soc5-panel shadow-[0_.05rem_.1rem_rgb(20_40_41_/_3%)]";
export const intradayCardClass =
  "flex min-h-0 min-w-0 flex-col rounded-[.55rem] bg-soc5-panel p-[clamp(.8rem,1.5vw,.9rem)]";
export const intradayHeadClass =
  "flex items-center justify-between gap-[.8rem] mb-[.6rem] max-[820px]:items-start max-[820px]:gap-2 max-[600px]:flex-col max-[600px]:gap-[.4rem]";
export const intradayTitleClass =
  "m-0 text-[clamp(1.1rem,1.9vw,1.2rem)] font-bold leading-tight text-soc5-ink";
export const intradayDescriptionClass =
  "flex items-center gap-[.3rem] text-xs font-medium leading-snug text-soc5-muted";
export const intradayMetaDotClass =
  "size-[.35rem] shrink-0 rounded-full bg-[#cfe85b] shadow-[0_0_0_.15rem_rgb(207_232_91_/_22%)]";
export const intradayFiltersClass =
  "inline-flex min-h-[2.2rem] min-w-[min(12.5rem,100%)] flex-nowrap items-center justify-start gap-2 rounded-[.55rem] border border-soc5-line bg-soc5-panel px-2 py-1 shadow-[inset_0_.05rem_0_white,0_.2rem_.6rem_rgb(10_29_45_/_7%)] max-[600px]:w-full";
export const intradayDateIconClass =
  "grid size-6 shrink-0 place-items-center rounded-[.4rem] border-0 bg-linehaul-teal-soft p-0 text-linehaul-teal-ink";
export const intradayInputClass =
  "min-h-[1.6rem] min-w-0 w-[6.3rem] flex-1 rounded-[.5rem] border border-transparent bg-transparent text-xs font-bold text-soc5-ink outline-none transition-[border-color,background-color,box-shadow] duration-150 focus:border-soc5-line focus:bg-soc5-panel focus:ring-[.2rem] focus:ring-[rgb(20_184_166_/_14%)] max-[600px]:w-full";
export const intradaySummaryClass =
  "grid grid-cols-[minmax(7.5rem,max-content)_minmax(7.5rem,max-content)_minmax(10.5rem,1fr)] items-center gap-[clamp(.7rem,2vw,1.1rem)] max-[820px]:grid-cols-3 max-[600px]:grid-cols-1 max-[600px]:gap-[.7rem]";
export const intradayKpiClass = "grid min-w-0 gap-[.15rem]";
export const intradayKpiLabelClass =
  "text-xs font-semibold uppercase leading-tight tracking-wider text-soc5-muted";
export const intradayKpiValueClass =
  "flex min-h-6 items-baseline gap-[.35rem] text-[clamp(1.4rem,2.8vw,1.9rem)] font-semibold leading-tight tracking-tight text-soc5-ink tabular-nums";
export const intradayKpiAccentClass = "text-linehaul-teal-ink";
export const intradayKpiSuffixClass =
  "whitespace-nowrap text-xs font-semibold text-soc5-muted";
export const intradayLiveStatusClass =
  "inline-flex min-h-[1.4rem] items-center gap-[.35rem] justify-self-end whitespace-nowrap text-xs font-medium leading-tight text-soc5-muted max-[820px]:col-span-full max-[820px]:justify-self-start max-[600px]:w-full max-[600px]:justify-between";
export const intradayLiveDotClass =
  "size-[.6rem] shrink-0 rounded-full bg-[#d7ec65] shadow-[0_0_0_.2rem_rgb(215_236_101_/_28%),0_0_1rem_rgb(215_236_101_/_62%)] animate-pulse motion-reduce:animate-none";
export const intradayLiveLabelClass =
  "hidden text-xs font-bold uppercase tracking-wider text-linehaul-teal-ink";
export const lineChartClass =
  "block h-[clamp(8.5rem,18vw,10.5rem)] min-h-[8.5rem] w-full min-w-0 overflow-hidden";
export const lineChartSvgClass =
  "block h-full min-w-0 w-full overflow-visible [shape-rendering:geometricPrecision]";
export const chartGridLineClass = "stroke-soc5-line [stroke-dasharray:7_7] [stroke-width:1]";
export const chartYLabelClass = "fill-soc5-muted text-xs font-semibold [text-anchor:end]";
export const lineAreaClass = "fill-[url(#lineAreaTop)] stroke-none";
export const lineStrokeClass =
  "fill-none stroke-[#b5d93f] [stroke-width:2.8] [stroke-linecap:round] [stroke-linejoin:round]";
export const chartPointGroupClass =
  "cursor-crosshair outline-none [&>circle]:fill-linehaul-lime-ink [&>circle]:stroke-[#b5d93f] [&>circle]:[stroke-width:2.2] [&>circle]:transition-[r,fill,stroke-width] [&>circle]:duration-150 hover:[&>circle]:fill-linehaul-lime-ink hover:[&>circle]:stroke-soc5-line hover:[&>circle]:[stroke-width:2.8] focus-visible:outline focus-visible:outline-[.1rem] focus-visible:outline-[#0ea69b] focus-visible:outline-offset-[.15rem] data-[active=true]:[&>circle]:fill-linehaul-lime-ink data-[active=true]:[&>circle]:stroke-soc5-line";
export const chartXLabelClass = "fill-soc5-muted text-xs font-semibold [text-anchor:middle]";
export const chartHoverStateClass =
  "pointer-events-none [&>line]:stroke-[#72c9c4] [&>line]:[stroke-dasharray:3_3] [&>line]:[stroke-width:1.2] [&>circle]:fill-soc5-panel [&>circle]:stroke-[#087f7c] [&>circle]:[stroke-width:2.7] [&>rect]:fill-soc5-panel [&>rect]:stroke-soc5-line [&>rect]:filter-[drop-shadow(0_.35rem_.6rem_#17515024)] [&>text]:fill-soc5-muted [&>text]:text-xs [&>text]:font-bold [&>text]:[text-anchor:start] [&>text:last-child]:fill-linehaul-teal-ink";
export const dashboardListClass = "grid gap-[.35rem]";
export const dashboardTripsPanelClass =
  "min-h-[15.5rem] overflow-hidden border-[#087f7c]/[.14] bg-[linear-gradient(180deg,rgb(239_249_247_/_72%),rgb(255_255_255_/_0%)_35%),#fff] dark:bg-none dark:bg-soc5-panel";
export const tripsPanelBodyClass =
  "min-w-0 bg-[linear-gradient(135deg,#f6fbfa,#fff)] px-[.7rem] pb-[.7rem] pt-[.65rem] dark:bg-none dark:bg-soc5-panel";
export const queueRowClass =
  "grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-[.4rem] rounded-[.55rem] border border-soc5-line bg-soc5-panel p-[.45rem] transition-[transform,border-color,box-shadow,background-color] duration-150 hover:-translate-y-px hover:border-soc5-line hover:bg-soc5-panel hover:shadow-[0_.3rem_.8rem_rgb(20_54_54_/_6%)] max-[600px]:grid-cols-[1.4rem_minmax(0,1fr)_auto] max-[600px]:[&>span:last-child]:hidden";
export const linehaulRowClass = `${queueRowClass} relative min-h-[2.7rem] grid-cols-[1.5rem_minmax(5rem,1.15fr)_minmax(4.6rem,.9fr)_minmax(3.4rem,.7fr)] rounded-[.55rem] border-soc5-line bg-soc5-panel py-2 pl-[.65rem] pr-2 before:absolute before:bottom-[.45rem] before:left-0 before:top-[.45rem] before:w-[.15rem] before:rounded-r-[.2rem] before:bg-[#087f7c] max-[600px]:grid-cols-[1.4rem_minmax(0,1fr)_auto]`;
export const queueRowGroupClass = "grid min-w-0 gap-[.1rem] [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-xs [&>strong]:font-bold [&>small]:text-xs";
export const avatarClass = "grid size-[1.4rem] place-items-center rounded-full bg-linehaul-lime-surface text-xs font-bold text-linehaul-lime-ink";
export const truckDotClass = `${avatarClass} text-linehaul-lime-ink`;
export const compactEmptyClass = "m-0 p-5 text-center text-xs text-soc5-muted";
export const donutLayoutClass =
  "grid grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-[.6rem] max-[600px]:grid-cols-1";
export const donutClass =
  "relative grid size-[6.25rem] place-items-center justify-self-center rotate-[-12deg] rounded-full my-[.4rem] max-[600px]:mb-0 before:size-[4.1rem] before:rounded-full before:bg-soc5-panel before:shadow-[inset_0_0_0_.05rem_#f0f0f0] before:content-['']";
export const donutCenterClass = "absolute grid place-items-center rotate-[12deg]";
export const donutCenterValueClass = "text-base font-semibold text-soc5-ink tabular-nums";
export const donutCenterLabelClass = "text-xs text-soc5-muted";
export const donutLegendClass = "grid gap-[.3rem]";
export const donutLegendItemClass =
  "grid grid-cols-[.45rem_1fr_auto] items-center gap-[.35rem] rounded-[.4rem] border border-soc5-line bg-linehaul-surface-soft p-[.35rem]";
export const donutLegendSwatchClass = "size-[.4rem] rounded-[.1rem]";
export const donutLegendValueClass = "text-xs font-semibold text-soc5-ink tabular-nums";

export const printDialogClass =
  "print-dialog w-[min(49rem,100%)] max-h-[min(43rem,calc(100dvh-1.6rem))] overflow-hidden rounded-[.9rem] border border-[#dfe5e8] bg-[#f4f7f8] shadow-[0_1.4rem_4rem_rgb(14_23_38_/_28%),0_.2rem_.9rem_rgb(14_23_38_/_10%)] animate-[dialog-panel-in_.34s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none max-[640px]:max-h-[calc(100dvh-1.2rem)] max-[640px]:rounded-[.8rem_.8rem_.6rem_.6rem]";
export const printToolbarClass =
  "print-toolbar flex min-w-0 flex-wrap items-center justify-between gap-[.9rem] border-b border-[#e1e7ea] bg-white px-[.9rem] py-3 text-[#26313a] max-[640px]:px-3 max-[640px]:py-[.7rem]";
export const printToolbarActionsClass = "flex items-center gap-[.4rem]";
export const printToolbarTitleClass = "font-display text-xs tracking-tight";
export const printPreviewClass =
  "print-preview min-h-[15rem] min-w-0 max-w-full overflow-auto bg-[#f4f7f8] p-[clamp(1rem,5vw,2.4rem)] [background-image:linear-gradient(45deg,#eaf0f2_25%,transparent_25%),linear-gradient(-45deg,#eaf0f2_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eaf0f2_75%),linear-gradient(-45deg,transparent_75%,#eaf0f2_75%)] [background-position:0_0,0_.45rem,.45rem_-.45rem,-.45rem_0] [background-size:.9rem_.9rem] print:p-0 print:bg-white max-[640px]:px-2.5 max-[640px]:py-4";
export const truckLabelClass =
  "relative mx-auto w-[min(100%,48rem)] aspect-video [container-type:inline-size] bg-white shadow-[0_.6rem_1.4rem_rgb(14_23_38_/_12%)] print:w-full print:shadow-none";
export const truckLabelImageClass = "block h-auto w-full";
export const truckLabelValueClass =
  "absolute z-[1] box-border flex items-center justify-center overflow-hidden px-[.5%] text-center font-bold leading-[1.05] text-[#111] [font-family:Arial,Helvetica,sans-serif] [overflow-wrap:anywhere]";
export const truckLabelPlateClass =
  "top-[10%] left-[62.8%] h-[8%] w-[34%] text-[5cqw]";
export const truckLabelDriverClass =
  "left-[3.2%] top-[28.5%] h-[18.5%] w-[21%] flex-col gap-[2%] text-[3.2cqw]";
export const truckLabelDockClass =
  "left-[27.5%] top-[28.5%] h-[18.5%] w-[21%] text-[9cqw]";
export const truckLabelDockTimeClass =
  "left-[51.8%] top-[28.5%] h-[18.5%] w-[20.8%] text-[4cqw]";
export const truckLabelLoadBaseClass =
  "top-[60%] h-[21.5%] text-[6cqw]";
export const truckLabelLoadSingleClass = "left-[5%] w-[68.5%]";
export const truckLabelLoadLeftClass = "left-[4.2%] w-[33%]";
export const truckLabelLoadRightClass = "left-[39.6%] w-[33%]";
export const truckLabelLoadSecondClass = "left-[27.6%] w-[21.2%]";
export const driverQrClass =
  "block h-[68%] w-auto max-w-full shrink-0 aspect-square bg-white";
