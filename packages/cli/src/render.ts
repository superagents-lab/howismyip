import type { FactKey, IpReport } from '@howismyip/core';

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const code = (n: number) => (s: string) => (useColor ? `[${n}m${s}[0m` : s);

const c = {
  dim: code(2),
  bold: code(1),
  green: code(32),
  red: code(31),
  cyan: code(36),
  gray: code(90),
};

function row(label: string, value: string): string {
  return `  ${c.gray(label.padEnd(12))} ${value}`;
}

function primaryFact(report: IpReport, key: FactKey): string | null {
  const fact = report.facts.find((item) => item.key === key);
  if (!fact) {
    return null;
  }
  return (
    [...fact.values].sort((a, b) => b.sources.length - a.sources.length)[0]
      ?.value ?? null
  );
}

/** Human identity plus compact registration/routing relationships. */
function consensusLines(report: IpReport): string[] {
  const { consensus: k } = report;
  const lines = [c.bold(c.green(`▍ ${report.ip}`))];

  if (k.blocklists.length > 0) {
    lines.push(row('blocklists', c.red(k.blocklists.join(', '))));
  }
  const location = [k.city, k.country_name].filter(Boolean).join(', ');
  if (location) {
    lines.push(row('location', location));
  }
  if (k.asn) {
    lines.push(row('asn', `${k.asn}${k.isp ? c.dim(` · ${k.isp}`) : ''}`));
  }
  const allocation = primaryFact(report, 'allocation');
  const registration = [k.registered_country_code, k.rir, allocation]
    .filter(Boolean)
    .join(' · ');
  if (registration) {
    lines.push(row('registration', registration));
  }
  const announcedPrefix = primaryFact(report, 'announced_prefix');
  const ptr = primaryFact(report, 'ptr');
  const originAsn = primaryFact(report, 'origin_asn');
  const originHolder = primaryFact(report, 'origin_holder');
  const announcement = primaryFact(report, 'announcement');
  const rpki = primaryFact(report, 'rpki');
  const route =
    originAsn && announcedPrefix
      ? `${originAsn} → ${announcedPrefix}`
      : (originAsn ?? announcedPrefix);
  if (route) {
    const routeState = [
      announcement === 'announced'
        ? 'announced'
        : announcement === 'not_announced'
          ? 'not announced'
          : null,
      rpki ? `RPKI ${rpki.replaceAll('_', ' ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      row(
        'route',
        `${route}${originHolder ? c.dim(` · ${originHolder}`) : ''}${
          routeState ? c.dim(` · ${routeState}`) : ''
        }`
      )
    );
  }
  if (ptr) {
    lines.push(row('reverse dns', ptr));
  }
  return lines;
}

function statusMark(status: string): string {
  if (status === 'ok') {
    return c.green('ok ');
  }
  if (status === 'error') {
    return c.red('err');
  }
  return c.gray(status.slice(0, 3));
}

/** The per-source list with status, timing, and any error. */
function sourceLines(report: IpReport): string[] {
  const { consensus: k } = report;
  const lines = [
    '',
    c.dim(`  sources (${k.source_count}/${report.sources.length} responded):`),
  ];
  for (const s of report.sources) {
    const detail = s.status === 'error' ? c.dim(` ${s.error ?? ''}`) : '';
    lines.push(
      `    ${statusMark(s.status)} ${s.name.padEnd(18)} ${c.gray(`${s.durationMs}ms`)}${detail}`
    );
  }
  return lines;
}

/** Render a report as a colored terminal summary. */
export function renderReport(report: IpReport): string {
  return [...consensusLines(report), ...sourceLines(report)].join('\n');
}
