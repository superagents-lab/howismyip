/** Lightweight, zero-dep i18n. URL-path based (/en, /zh). */

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" && (locales as readonly string[]).includes(value)
	);
}

const en = {
	meta: {
		title: "howismyip · multi-source IP intelligence",
		description:
			"Check an IP against many reputation, geolocation, ASN, registry and blocklist sources at once. Keyless by default, open source, agent-ready.",
	},
	tagline: "multi-source IP reputation — one query, every angle.",
	search: {
		prefix: "whois",
		placeholder: "8.8.8.8  ·  2606:4700::1111",
		run: "run ↵",
		searching: "searching…",
		scan: "scan my IP ▶",
		scanning: "scanning…",
		loadingDetail: "multi-source lookup in progress",
		hint: "enter any IPv4 / IPv6 address, or scan the address you're connecting from.",
		notePrivate: (ip: string) =>
			`detected ${ip} — a private/LAN address (expected in local dev).`,
		noteUndetectable: "couldn't determine your public IP from this connection.",
	},
	home: {
		sourcesTitle: (active: number, total: number) =>
			`// data sources (${active}/${total} active)`,
		keyless: "keyless",
		needsKey: "needs key",
		keyed: "keyed",
		note: "keyless sources run out of the box. add API keys to unlock the rest — see",
		footerAccess: "programmatic access:",
		footerOpenSource: "· open source (MIT)",
	},
	report: {
		onBlocklists: "on blocklists:",
		copyCurl: "copy curl",
		copyJson: "copy json",
		copied: "copied!",
		viewSource: "view source",
		hideSource: "hide source",
		queried: (queried: number, responded: number, riskShown: number) =>
			`// ${queried} sources queried · ${responded} responded · ${riskShown} risk sources shown`,
		location: "location",
		asn: "asn",
		isp: "isp",
		org: "org",
		rir: "rir",
		sectionFacts: "// basic facts — source-transparent identity",
		sectionRisk: "// provider risk scores — no composite score",
		sectionProviderDetails: "// provider evidence — risk and blocklist sources",
		colSource: "source",
		colScore: "score",
		colSignals: "signals",
		colVerdict: "verdict",
		expand: "expand",
		collapse: "collapse",
		otherValues: (count: number) => `+${count} variants`,
		noScore: "no score",
		sources: "sources",
		conflict: "conflict",
		noFacts: "no factual identity fields returned",
	},
	fact: {
		country: "country",
		city: "city",
		region: "region",
		asn: "asn",
		isp: "isp",
		organization: "org",
	},
	card: {
		viewAtSource: "view at source ↗",
		status: "status",
		latency: "latency",
		evidence: "evidence",
		noData: "no data for this IP",
		risk: "risk",
		listed: "listed:",
		notListed: "not on any blocklist",
		notTor: "not a Tor exit node",
		torExit: "Tor exit node",
		clean: "no negative signal",
	},
	signal: {
		proxy: "proxy",
		vpn: "VPN",
		tor: "Tor",
		hosting: "hosting",
		abuser: "abuse",
		crawler: "crawler",
		mobile: "mobile",
		anycast: "anycast",
		relay: "relay",
	},
	fields: {
		country: "country",
		city: "city",
		region: "region",
		continent: "continent",
		asn: "asn",
		isp: "isp",
		org: "org",
		asDomain: "as domain",
		proxyType: "proxy type",
		usageType: "usage type",
		companyType: "company type",
		connectionType: "connection type",
		rir: "rir",
		network: "network",
		allocated: "allocated",
		abuse: "abuse",
		riskReasons: "risk reasons",
	},
	risk: { low: "low", medium: "medium", high: "high" },
	category: {
		geo: "geo",
		network: "network",
		risk: "risk",
		registry: "registry",
		blocklist: "blocklist",
	},
	error: {
		invalid: (ip: string) => `"${ip}" is not a valid IP address.`,
		failed: "lookup failed.",
	},
};

export type Dictionary = typeof en;

const zh: Dictionary = {
	meta: {
		title: "howismyip · 多源 IP 情报",
		description:
			"一次查询，跨多个信誉、地理、ASN、注册局与黑名单数据源同时检测一个 IP。无 key 开箱即用，开源，agent 友好。",
	},
	tagline: "多源 IP 信誉 —— 一次查询，多角度交叉。",
	search: {
		prefix: "whois",
		placeholder: "8.8.8.8  ·  2606:4700::1111",
		run: "查询 ↵",
		searching: "查询中…",
		scan: "查我的 IP ▶",
		scanning: "查询中…",
		loadingDetail: "多源查询进行中",
		hint: "输入任意 IPv4 / IPv6 地址，或扫描你当前连接所用的地址。",
		notePrivate: (ip: string) =>
			`检测到 ${ip} —— 私有/局域网地址（本地开发时正常）。`,
		noteUndetectable: "无法从当前连接判断你的公网 IP。",
	},
	home: {
		sourcesTitle: (active: number, total: number) =>
			`// 数据源（${active}/${total} 在线）`,
		keyless: "无需 key",
		needsKey: "需要 key",
		keyed: "已配 key",
		note: "无 key 源开箱即用。配置 API key 可解锁其余源 —— 见",
		footerAccess: "程序化调用：",
		footerOpenSource: "· 开源（MIT）",
	},
	report: {
		onBlocklists: "命中黑名单：",
		copyCurl: "复制 curl",
		copyJson: "复制 json",
		copied: "已复制！",
		viewSource: "查看原始数据",
		hideSource: "收起原始数据",
		queried: (queried: number, responded: number, riskShown: number) =>
			`// 查询 ${queried} 个源 · ${responded} 个响应 · 展示 ${riskShown} 个风险源`,
		location: "位置",
		asn: "ASN",
		isp: "ISP",
		org: "组织",
		rir: "注册局",
		sectionFacts: "// 基础事实 — 透明展示来源",
		sectionRisk: "// 平台风险得分 — 不做综合分",
		sectionProviderDetails: "// 平台证据 — 风险与黑名单来源",
		colSource: "源",
		colScore: "分数",
		colSignals: "信号",
		colVerdict: "判定",
		expand: "展开",
		collapse: "收起",
		otherValues: (count: number) => `另有 ${count} 种`,
		noScore: "无分数",
		sources: "来源",
		conflict: "存在分歧",
		noFacts: "没有返回可展示的基础事实",
	},
	fact: {
		country: "国家",
		city: "城市",
		region: "地区",
		asn: "ASN",
		isp: "ISP",
		organization: "组织",
	},
	card: {
		viewAtSource: "在该源查看 ↗",
		status: "状态",
		latency: "耗时",
		evidence: "证据",
		noData: "该源无此 IP 数据",
		risk: "风险",
		listed: "命中：",
		notListed: "未命中任何黑名单",
		notTor: "非 Tor 出口节点",
		torExit: "Tor 出口节点",
		clean: "无异常信号",
	},
	signal: {
		proxy: "代理",
		vpn: "VPN",
		tor: "Tor",
		hosting: "机房",
		abuser: "滥用",
		crawler: "爬虫",
		mobile: "移动",
		anycast: "Anycast",
		relay: "中继",
	},
	fields: {
		country: "国家",
		city: "城市",
		region: "地区",
		continent: "大洲",
		asn: "ASN",
		isp: "ISP",
		org: "组织",
		asDomain: "AS 域名",
		proxyType: "代理类型",
		usageType: "用途类型",
		companyType: "公司类型",
		connectionType: "连接类型",
		rir: "注册局",
		network: "网段",
		allocated: "分配日期",
		abuse: "滥用联系",
		riskReasons: "风险原因",
	},
	risk: { low: "低", medium: "中", high: "高" },
	category: {
		geo: "地理",
		network: "网络",
		risk: "风险",
		registry: "注册",
		blocklist: "黑名单",
	},
	error: {
		invalid: (ip: string) => `“${ip}” 不是合法的 IP 地址。`,
		failed: "查询失败。",
	},
};

export const dictionaries: Record<Locale, Dictionary> = { en, zh };

export function getDictionary(locale: Locale): Dictionary {
	return dictionaries[locale];
}
