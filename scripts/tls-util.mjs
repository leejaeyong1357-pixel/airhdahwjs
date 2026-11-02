// 인증서 공용 도구 — 서버(serve-node.mjs)와 설정 스크립트(setup-cert.mjs)가 같이 쓴다.
import { X509Certificate, createPrivateKey } from "node:crypto";

const PEM_RE = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]+?-----END \1-----/g;

/** 파일 내용에서 인증서·개인키 블록을 꺼낸다. PEM 이 아니면 DER 인증서로 한 번 읽어본다. */
export function parseBlocks(buf) {
  const text = buf.toString("latin1");
  const certs = [];
  const keys = [];
  for (const m of text.matchAll(PEM_RE)) {
    const pem = m[0].replace(/\r\n/g, "\n") + "\n";
    if (m[1] === "CERTIFICATE") {
      certs.push(new X509Certificate(pem));
    } else if (m[1].endsWith("PRIVATE KEY")) {
      keys.push({
        pem,
        encrypted: m[1] === "ENCRYPTED PRIVATE KEY" || /Proc-Type:\s*4,ENCRYPTED/.test(pem),
      });
    }
  }
  if (!certs.length && !keys.length) {
    try {
      certs.push(new X509Certificate(buf)); // .crt/.cer 가 바이너리(DER)인 경우
    } catch {
      /* 인증서 파일이 아님 */
    }
  }
  return { certs, keys };
}

export const isSelfSigned = (x) => x.subject === x.issuer && x.verify(x.publicKey);

/**
 * 리프 인증서부터 발급자를 따라 올라가며 체인을 만든다.
 * 루트(자체 서명)는 넣지 않는다 — 브라우저가 이미 가지고 있다.
 */
export function buildChain(leaf, pool) {
  const chain = [leaf];
  let cur = leaf;
  let missing = false;
  for (let i = 0; i < 8 && !isSelfSigned(cur); i++) {
    const parent = pool.find(
      (c) => c.fingerprint256 !== cur.fingerprint256 && cur.checkIssued(c) && cur.verify(c.publicKey),
    );
    if (!parent) {
      missing = true;
      break;
    }
    if (isSelfSigned(parent)) break;
    chain.push(parent);
    cur = parent;
  }
  return { chain, missing };
}

/** "DNS:*.teczen.kr, DNS:teczen.kr" → ["*.teczen.kr", "teczen.kr"] */
export function sanNames(x) {
  return (x.subjectAltName ?? "")
    .split(/,\s*/)
    .filter((s) => s.startsWith("DNS:"))
    .map((s) => s.slice(4).toLowerCase());
}

/** 와일드카드는 한 단계만 맞는다 (*.teczen.kr 은 vibe.teczen.kr O, a.vibe.teczen.kr X) */
export function domainMatches(domain, names) {
  const d = domain.toLowerCase();
  return names.some((n) =>
    n.startsWith("*.") ? d.endsWith(n.slice(1)) && !d.slice(0, -n.length + 1).includes(".") : d === n,
  );
}

export const cnOf = (dn) => dn.match(/CN=([^\n,]+)/)?.[1] ?? dn.split("\n")[0];

export function daysLeft(x) {
  return Math.floor((new Date(x.validTo).getTime() - Date.now()) / 86_400_000);
}

export function fmtDate(s) {
  const d = new Date(s);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 암호로 개인키를 열어본다. 틀리면 null */
export function openKey(pem, passphrase) {
  try {
    return createPrivateKey({ key: pem, format: "pem", ...(passphrase ? { passphrase } : {}) });
  } catch {
    return null;
  }
}
