export const ASSISTANT_STYLES = `
  :host { all: initial; color-scheme: light; }
  * { box-sizing: border-box; }
  button, input, textarea { font: inherit; }
  .launcher {
    position: fixed; right: 22px; top: 44%; z-index: 2147483646;
    border: 0; border-radius: 12px; padding: 13px 15px; cursor: pointer;
    color: #fff; background: #e64c23; box-shadow: 0 8px 28px rgba(97,37,21,.3);
    font: 600 14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
  }
  .launcher:hover { background: #cf3e17; transform: translateY(-1px); }
  .backdrop { position: fixed; inset: 0; z-index: 2147483645; background: rgba(20,20,25,.38); display: none; }
  .backdrop.open { display: block; }
  .drawer {
    position: absolute; right: 0; top: 0; width: min(760px, 96vw); height: 100%;
    background: #f7f7f8; box-shadow: -14px 0 38px rgba(0,0,0,.22); overflow: auto;
    font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
  }
  .topbar { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; gap: 12px; padding: 16px 18px; color: #fff; background: #24262b; }
  .topbar h1 { font-size: 18px; margin: 0; flex: 1; }
  .topbar small { color: #cfd1d6; }
  .icon-button { border: 0; color: #fff; background: transparent; font-size: 22px; cursor: pointer; }
  .content { padding: 16px 18px 80px; }
  .notice { margin: 0 0 14px; padding: 11px 13px; border-left: 4px solid #e6a223; background: #fff7e6; color: #67490f; border-radius: 4px; }
  .status { display: none; margin: 0 0 14px; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; }
  .status.show { display: block; }
  .status.info { background: #e8f2ff; color: #174f8f; }
  .status.success { background: #e7f7ec; color: #246a37; }
  .status.error { background: #ffebea; color: #9f2620; }
  .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
  .card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .card h2 { font-size: 15px; margin: 0; flex: 1; color: #26272b; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  label { display: block; color: #5f6168; font-size: 12px; }
  input, textarea {
    width: 100%; margin-top: 4px; border: 1px solid #cfd0d5; border-radius: 6px;
    padding: 8px 9px; color: #222; background: #fff; outline: none;
  }
  input:focus, textarea:focus { border-color: #e64c23; box-shadow: 0 0 0 2px rgba(230,76,35,.12); }
  textarea { min-height: 66px; resize: vertical; }
  .button { border: 1px solid #cfd0d5; border-radius: 7px; background: #fff; color: #303238; padding: 7px 10px; cursor: pointer; }
  .button:hover { border-color: #999ba2; background: #fafafa; }
  .button.primary { color: #fff; background: #e64c23; border-color: #e64c23; font-weight: 600; }
  .button.danger { color: #a62a25; border-color: #e7aaa7; }
  .button.small { padding: 4px 7px; font-size: 12px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; min-width: 690px; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ececef; padding: 7px 5px; text-align: left; vertical-align: top; }
  th { color: #666971; font-size: 12px; background: #fafafa; }
  td input { margin: 0; padding: 6px; min-width: 72px; }
  td .name { min-width: 150px; }
  td .model { min-width: 120px; }
  .warning { color: #a55e00; font-size: 11px; margin-top: 3px; max-width: 190px; }
  .summary { display: flex; justify-content: flex-end; gap: 24px; padding-top: 10px; font-weight: 600; }
  .summary strong { color: #e64c23; font-size: 18px; }
  .actions { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px; border-top: 1px solid #ddd; background: rgba(255,255,255,.96); }
  .actions .primary { margin-left: auto; }
  .muted { color: #83858c; font-size: 12px; }
  @media (max-width: 620px) { .grid, .grid.two { grid-template-columns: 1fr; } .launcher { right: 8px; } }
`;
