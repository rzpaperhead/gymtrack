/** Draws a 1080×1350 summary card (Instagram-friendly) and shares or downloads it. */

export interface CardStat {
  label: string;
  value: string;
}

export async function shareSummaryCard(opts: {
  title: string;
  subtitle: string;
  stats: CardStat[];
  footer: string;
  fileName: string;
  shareText: string;
}): Promise<"shared" | "downloaded"> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  await document.fonts?.ready;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-barlow-condensed").trim() || "sans-serif";
  const body = getComputedStyle(document.documentElement).getPropertyValue("--font-barlow").trim() || "sans-serif";
  const lime = "#c5f04a";

  g.fillStyle = "#0b0c0f";
  g.fillRect(0, 0, W, H);
  const grad = g.createRadialGradient(W * 0.85, 0, 50, W * 0.85, 0, 900);
  grad.addColorStop(0, "rgba(197,240,74,0.28)");
  grad.addColorStop(1, "rgba(197,240,74,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  g.fillStyle = lime;
  g.font = `800 64px ${display}`;
  g.fillText("GYMTRACK", 80, 140);
  g.fillStyle = "#ffffff";
  g.font = `800 120px ${display}`;
  g.fillText(opts.title.toUpperCase(), 80, 300);
  g.fillStyle = "#a1a1aa";
  g.font = `500 44px ${body}`;
  g.fillText(opts.subtitle, 80, 370);

  const cols = 2;
  const cw = (W - 160 - 40) / cols;
  const ch = 220;
  opts.stats.slice(0, 6).forEach((s, i) => {
    const x = 80 + (i % cols) * (cw + 40);
    const y = 450 + Math.floor(i / cols) * (ch + 40);
    g.fillStyle = "#18191d";
    g.beginPath();
    g.roundRect(x, y, cw, ch, 36);
    g.fill();
    g.fillStyle = "#a1a1aa";
    g.font = `600 36px ${body}`;
    g.fillText(s.label.toUpperCase(), x + 40, y + 70);
    g.fillStyle = i === 0 ? lime : "#ffffff";
    g.font = `800 92px ${display}`;
    g.fillText(s.value, x + 40, y + 170, cw - 80);
  });

  g.fillStyle = "#a1a1aa";
  g.font = `500 36px ${body}`;
  g.fillText(opts.footer, 80, H - 80);

  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
  const file = new File([blob], opts.fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: opts.shareText });
      return "shared";
    } catch {
      // cancelled: fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
