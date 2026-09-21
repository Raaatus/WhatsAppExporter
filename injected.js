(() => {
  const HELLO = "WA_EXPORT_HELLO";
  const STATUS = "WA_EXPORT_STATUS";
  const CATALOG = "WA_EXPORT_CATALOG";
  const CATALOG_RES = "WA_EXPORT_CATALOG_RES";
  const RUN = "WA_EXPORT_RUN";
  const QUICK = "WA_EXPORT_QUICK";
  const PROGRESS = "WA_EXPORT_PROGRESS";
  const RUN_RES = "WA_EXPORT_RES";

  function post(payload) {
    window.postMessage(payload, "*");
  }

  const I18N_INJ = {
    en: {
      me: "Me",
      addressBook: "address book",
      group: "group",
      label: "label",
      unnamed: "Unnamed",
      notReady: "WhatsApp Web is not ready. Scan the QR code then reload the page.",
      chatHistoryMeta: "Message history",
      groupMetaNoCount: "Group messages",
      groupMetaWithCount: (count) => `${count} members · messages`,
      labelFallback: (id) => `Label ${id}`,
      contactsCountMeta: (count) => `${count} contacts`,
    },
    fr: {
      me: "Moi",
      addressBook: "carnet",
      group: "groupe",
      label: "label",
      unnamed: "Sans nom",
      notReady: "WhatsApp Web n'est pas pret. Scanne le QR puis recharge la page.",
      chatHistoryMeta: "Historique messages",
      groupMetaNoCount: "Messages de groupe",
      groupMetaWithCount: (count) => `${count} membres · messages`,
      labelFallback: (id) => `Label ${id}`,
      contactsCountMeta: (count) => `${count} contacts`,
    },
    de: {
      me: "Ich",
      addressBook: "Adressbuch",
      group: "Gruppe",
      label: "Label",
      unnamed: "Unbenannt",
      notReady: "WhatsApp Web ist nicht bereit. Scanne den QR-Code und lade die Seite neu.",
      chatHistoryMeta: "Nachrichtenverlauf",
      groupMetaNoCount: "Gruppennachrichten",
      groupMetaWithCount: (count) => `${count} Mitglieder · Nachrichten`,
      labelFallback: (id) => `Label ${id}`,
      contactsCountMeta: (count) => `${count} Kontakte`,
    },
  };
  let currentLang = "en";
  function tInj(key) {
    return (I18N_INJ[currentLang] || I18N_INJ.en)[key];
  }

  function safeGet(obj, key) {
    try {
      const value = obj?.[key];
      return typeof value === "function" ? value.call(obj) : value;
    } catch {
      return undefined;
    }
  }

  function isWppLike(obj) {
    return !!(obj && typeof obj === "object" && obj.contact && obj.chat && obj.conn);
  }

  function discoverWpps() {
    const found = [];
    try {
      for (const key of Object.keys(window)) {
        if ((key === "WPP" || key.startsWith("WPP_")) && isWppLike(window[key])) found.push(window[key]);
      }
    } catch {
      /* ignore */
    }
    if (isWppLike(window.WPP) && !found.includes(window.WPP)) found.unshift(window.WPP);
    return found;
  }

  function isConnReady(wpp) {
    if (!wpp) return false;
    try {
      if (typeof wpp.conn?.isMainReady === "function" && typeof wpp.conn?.isAuthenticated === "function") {
        const connReady = !!(wpp.conn.isMainReady() && wpp.conn.isAuthenticated());
        if (!connReady) return false;
        // conn ready fires before wa-js finishes wrapping its internal message-history
        // APIs (its own "full ready" stage) — exporting too early silently yields only
        // whatever is already cached locally (e.g. just the last message per chat).
        if (typeof wpp.isFullReady === "boolean") return wpp.isFullReady;
        return true;
      }
    } catch {
      /* fall through */
    }
    return !!(wpp.isFullReady || wpp.isReady);
  }

  function pickReadyWpp() {
    return discoverWpps().find(isConnReady) || null;
  }

  function widString(id) {
    if (!id) return "";
    if (typeof id === "string") return id;
    return id._serialized || (id.user && id.server ? `${id.user}@${id.server}` : "");
  }

  function phoneDigits(value) {
    if (!value) return "";
    if (typeof value === "number" && Number.isFinite(value)) return phoneDigits(String(value));
    if (typeof value === "string") {
      const userPart = value.includes("@") ? value.split("@")[0] : value;
      const digits = userPart.replace(/[^\d]/g, "");
      return /^\d{6,20}$/.test(digits) ? digits : "";
    }
    if (typeof value === "object") {
      return (
        phoneDigits(value.id) ||
        phoneDigits(value.user) ||
        phoneDigits(value._serialized) ||
        phoneDigits(value.phoneNumber)
      );
    }
    return "";
  }

  function isLidWid(id) {
    if (!id) return false;
    try {
      if (typeof id.isLid === "function") return !!id.isLid();
    } catch {
      /* ignore */
    }
    return id.server === "lid";
  }

  async function resolvePhoneUser(wpp, contact) {
    const id = contact?.id;
    let user = "";
    if (id && id.server === "c.us" && id.user) user = phoneDigits(id.user);

    if (!user && isLidWid(id) && typeof wpp?.contact?.getPnLidEntry === "function") {
      try {
        const entry = await wpp.contact.getPnLidEntry(id);
        user = phoneDigits(entry?.phoneNumber);
      } catch {
        /* cache miss */
      }
    }

    if (!user) {
      const lidUser = isLidWid(id) ? phoneDigits(id.user) : "";
      const extras = [
        phoneDigits(safeGet(contact, "formattedPhone")),
        phoneDigits(safeGet(contact, "userid")),
        phoneDigits(safeGet(contact, "pnForLid")),
      ];
      user = extras.find((value) => value && value !== lidUser) || "";
    }
    if (!user || user.length <= 2) return "";
    return user;
  }

  function pickName(contact) {
    const keys = ["name", "notifyName", "verifiedName", "mentionName", "formattedName", "shortName", "pushname"];
    for (const key of keys) {
      const value = safeGet(contact, key);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function chatTitle(chat) {
    return (
      safeGet(chat, "formattedTitle") ||
      safeGet(chat, "name") ||
      pickName(chat?.contact) ||
      safeGet(chat, "formattedName") ||
      widString(chat?.id) ||
      tInj("unnamed")
    );
  }

  function isMe(contact) {
    return !!safeGet(contact, "isMe");
  }

  function isUser(contact) {
    const flag = safeGet(contact, "isUser");
    if (flag === true) return true;
    const server = contact?.id?.server;
    return server === "c.us" || server === "lid";
  }

  async function mapPool(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;
    async function run() {
      while (index < items.length) {
        const current = index++;
        results[current] = await worker(items[current], current);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, run));
    return results;
  }

  function waitForWpp(timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      let bound = false;
      let done = false;
      const finish = (wpp) => {
        if (done) return;
        done = true;
        resolve(wpp);
      };
      const fail = (error) => {
        if (done) return;
        done = true;
        reject(error);
      };
      const tick = () => {
        if (done) return;
        const ready = pickReadyWpp();
        if (ready) {
          finish(ready);
          return;
        }
        const first = discoverWpps()[0] || window.WPP;
        if (first?.webpack && !bound) {
          bound = true;
          try {
            first.webpack.onReady?.(() => {
              const later = pickReadyWpp();
              if (later) finish(later);
            });
            first.webpack.onFullReady?.(() => {
              const later = pickReadyWpp();
              if (later) finish(later);
            });
          } catch {
            bound = false;
          }
        }
        if (Date.now() - started > timeoutMs) {
          fail(new Error(tInj("notReady")));
          return;
        }
        setTimeout(tick, 400);
      };
      tick();
    });
  }

  async function toRow(wpp, contact, extra = {}) {
    if (!contact?.id || isMe(contact) || !isUser(contact)) return { skipped: true };
    const user = await resolvePhoneUser(wpp, contact);
    if (!user) return { skipped: true };
    return {
      name: pickName(contact) || `+${user}`,
      phone: `+${user}`,
      saved: !!safeGet(contact, "isMyContact"),
      admin: !!extra.admin,
      source: extra.source || "",
      group: extra.group || "",
    };
  }

  function mergeRows(rows, dedupe) {
    if (!dedupe) return rows.filter((row) => row && !row.skipped);
    const byPhone = new Map();
    for (const row of rows) {
      if (!row || row.skipped) continue;
      const prev = byPhone.get(row.phone);
      if (!prev) {
        byPhone.set(row.phone, { ...row });
        continue;
      }
      if (prev.name === prev.phone && row.name !== row.phone) prev.name = row.name;
      if (!prev.saved && row.saved) prev.saved = true;
      if (!prev.admin && row.admin) prev.admin = true;
      if (row.group && prev.group && !prev.group.split(" | ").includes(row.group)) {
        prev.group = `${prev.group} | ${row.group}`;
      } else if (row.group && !prev.group) prev.group = row.group;
    }
    return [...byPhone.values()];
  }

  function catalogContacts(wpp) {
    const all = wpp.contact?.list ? wpp.contact.list() : [];
    return Promise.resolve(all).then((contacts) => {
      const source = (contacts || []).filter(
        (contact) => isUser(contact) && safeGet(contact, "isMyContact") && contact.id && !isMe(contact)
      );
      const list = source.length
        ? source
        : (contacts || []).filter((contact) => isUser(contact) && contact.id && !isMe(contact) && pickName(contact));
      return list
        .map((contact) => ({
          id: widString(contact.id),
          name: pickName(contact) || widString(contact.id),
          meta: safeGet(contact, "isMyContact") ? tInj("addressBook") : "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    });
  }

  function isGroupChat(chat) {
    try {
      if (chat?.id?.isGroup?.()) return true;
    } catch {
      /* ignore */
    }
    const id = widString(chat?.id);
    return id.endsWith("@g.us") || id.includes("@broadcast");
  }

  function isDirectChat(chat) {
    if (isGroupChat(chat)) return false;
    if (safeGet(chat, "isUser")) return true;
    const id = widString(chat?.id);
    return id.endsWith("@c.us") || id.endsWith("@lid");
  }

  async function listUserChats(wpp) {
    let chats = [];
    try {
      chats = (await wpp.chat.list({ onlyUsers: true })) || [];
    } catch {
      chats = [];
    }
    if (!chats.length) {
      chats = (await wpp.chat.list()) || [];
    }
    return chats.filter((chat) => isDirectChat(chat) && chat.contact && !isMe(chat.contact));
  }

  async function catalogChats(wpp) {
    const chats = await listUserChats(wpp);
    return chats
      .map((chat) => ({
        id: widString(chat.id) || widString(chat.contact.id),
        name: chatTitle(chat),
        meta: tInj("chatHistoryMeta"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  function groupCount(chat) {
    const meta = chat?.groupMetadata;
    const participants = meta?.participants;
    if (typeof participants?.length === "number") return participants.length;
    if (typeof participants?.getModelsArray === "function") {
      try {
        return participants.getModelsArray().length;
      } catch {
        /* ignore */
      }
    }
    if (typeof meta?.size === "number") return meta.size;
    return null;
  }

  async function catalogGroups(wpp) {
    let chats = [];
    try {
      chats = (await wpp.chat.list({ onlyGroups: true })) || [];
    } catch {
      chats = ((await wpp.chat.list({ ignoreGroupMetadata: true })) || []).filter((chat) =>
        widString(chat.id).endsWith("@g.us")
      );
    }
    return chats
      .map((chat) => {
        const id = widString(chat.id);
        if (!id) return null;
        const count = groupCount(chat);
        return { id, name: chatTitle(chat), meta: count != null ? tInj("groupMetaWithCount")(count) : tInj("groupMetaNoCount") };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  async function catalogLabels(wpp) {
    if (!wpp.labels?.getAllLabels) return [];
    let labels = [];
    try {
      labels = (await wpp.labels.getAllLabels()) || [];
    } catch {
      return [];
    }
    const contacts = (await wpp.contact.list()) || [];
    return labels
      .map((label) => {
        const id = String(label.id ?? "");
        if (!id) return null;
        const count = contacts.filter(
          (contact) => Array.isArray(contact.labels) && contact.labels.map(String).includes(id)
        ).length;
        return { id, name: label.name || tInj("labelFallback")(id), meta: tInj("contactsCountMeta")(count) };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }

  async function getGroupMembers(wpp, groupId) {
    if (typeof wpp.group?.getParticipants === "function") {
      try {
        const parts = await wpp.group.getParticipants(groupId);
        if (Array.isArray(parts) && parts.length) return parts;
      } catch {
        /* fallback */
      }
    }
    const chats = (await wpp.chat.list({ onlyGroups: true })) || [];
    const chat = chats.find((item) => widString(item.id) === groupId);
    const participants = chat?.groupMetadata?.participants;
    if (typeof participants?.getModelsArray === "function") return participants.getModelsArray();
    if (Array.isArray(participants)) return participants;
    return [];
  }

  function participantContact(part) {
    return part?.contact || part;
  }

  function participantAdmin(part) {
    return !!(safeGet(part, "isAdmin") || safeGet(part, "isSuperAdmin"));
  }

  async function catalog(tab) {
    const wpp = await waitForWpp();
    if (tab === "chats") return catalogChats(wpp);
    if (tab === "groups") return catalogGroups(wpp);
    if (tab === "labels") return catalogLabels(wpp);
    return catalogContacts(wpp);
  }

  async function allIdsForTab(wpp, tab) {
    const items = await catalog(tab);
    return items.map((item) => item.id);
  }

  function exportKind(tab, payload) {
    if (tab === "chats") return "messages";
    if (tab === "groups") return payload.groupMode === "members" ? "contacts" : "messages";
    return "contacts";
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().replace("T", " ").slice(0, 19);
  }

  function msgBody(msg) {
    const body = safeGet(msg, "body") ?? msg?.body;
    const caption = safeGet(msg, "caption") ?? msg?.caption;
    if (typeof body === "string" && body.trim()) return body.trim();
    if (typeof caption === "string" && caption.trim()) return caption.trim();
    return "";
  }

  function msgType(msg) {
    return safeGet(msg, "type") || msg?.type || "unknown";
  }

  function msgFromMe(msg) {
    if (!msg) return false;
    const checks = [
      () => safeGet(msg, "isSentByMe"),
      () => safeGet(msg, "fromMe"),
      () => msg.isSentByMe,
      () => msg.fromMe,
      () => {
        const id = msg.id || safeGet(msg, "id");
        if (!id) return false;
        if (typeof id.fromMe === "function") return id.fromMe();
        return safeGet(id, "fromMe") === true || id.fromMe === true;
      },
    ];
    for (const check of checks) {
      try {
        if (check() === true) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  function msgSenderLabel(msg, chatLabel, isGroup) {
    if (msgFromMe(msg)) return tInj("me");
    if (isGroup) {
      const contact = msg?.contact;
      const name = contact ? pickName(contact) : "";
      if (name) return name;
      const author = widString(msg?.author || safeGet(msg, "author"));
      if (author) return author.split("@")[0];
    }
    return chatLabel;
  }

  function messageTimestamp(msg) {
    return Number(msg?.t ?? safeGet(msg, "t") ?? 0);
  }

  function messageIdSerialized(msg) {
    const id = msg?.id || safeGet(msg, "id");
    if (!id) return "";
    if (typeof id === "string") return id;
    if (id._serialized) return id._serialized;
    try {
      if (typeof id.toString === "function") {
        const value = id.toString();
        if (value && value !== "[object Object]") return value;
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  function messagesFromChatModel(chat) {
    if (!chat) return [];
    const out = [];
    const push = (list) => {
      if (Array.isArray(list) && list.length) out.push(...list);
    };
    try {
      if (typeof chat.getAllMsgs === "function") push(chat.getAllMsgs());
    } catch {
      /* ignore */
    }
    try {
      const collection = chat.msgs;
      if (collection && typeof collection.getModelsArray === "function") push(collection.getModelsArray());
      else if (Array.isArray(collection)) push(collection);
    } catch {
      /* ignore */
    }
    return out;
  }

  async function resolveChat(wpp, chatOrId) {
    if (chatOrId && typeof chatOrId === "object" && chatOrId.id) return chatOrId;
    const chatId = String(chatOrId || "");
    if (!chatId || !wpp.chat?.get) return null;
    try {
      return (await wpp.chat.get(chatId)) || null;
    } catch {
      return null;
    }
  }

  // wpp.chat.getMessages() only ever queries the local, already-synced message
  // store — it never asks WhatsApp for older history on its own. A chat that was
  // never opened in this browser session only has its single preview message
  // synced locally, so getMessages(count:-1) faithfully (and silently) returns
  // just that one message no matter how it's called. The only way to pull real
  // history is the same thing the UI does when you scroll up in a chat: calling
  // the chat model's own loadEarlierMsgs(), repeatedly, until it stops yielding
  // new messages — that's what actually round-trips to fetch older history.
  async function ensureFullHistory(chat, budgetMs = 25000) {
    const label = chatTitle(chat);
    if (!chat || typeof chat.loadEarlierMsgs !== "function") {
      console.log(`[WA-Export] ${label}: loadEarlierMsgs indisponible sur cet objet chat (historique local uniquement).`);
      return;
    }
    const started = Date.now();
    let lastCount = messagesFromChatModel(chat).length;
    let iterations = 0;
    for (let i = 0; i < 2000; i++) {
      if (Date.now() - started > budgetMs) {
        console.log(`[WA-Export] ${label}: budget de temps atteint après ${iterations} appel(s), ${lastCount} message(s).`);
        break;
      }
      let more;
      try {
        more = await chat.loadEarlierMsgs();
      } catch (error) {
        console.log(`[WA-Export] ${label}: loadEarlierMsgs a échoué à l'itération ${iterations}`, error);
        break;
      }
      iterations += 1;
      const count = messagesFromChatModel(chat).length;
      if (more === false || count <= lastCount) {
        console.log(`[WA-Export] ${label}: arrêt après ${iterations} appel(s) — more=${more}, ${count} message(s).`);
        lastCount = count;
        break;
      }
      lastCount = count;
    }
    console.log(`[WA-Export] ${label}: ${lastCount} message(s) en local après chargement.`);
  }

  async function getChatMessages(wpp, chatOrId) {
    const chat = await resolveChat(wpp, chatOrId);
    if (!chat) return [];

    await ensureFullHistory(chat);

    const seen = new Set();
    const fromModel = [];
    for (const msg of messagesFromChatModel(chat)) {
      const key = messageIdSerialized(msg);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      fromModel.push(msg);
    }
    if (fromModel.length) return fromModel.sort((a, b) => messageTimestamp(a) - messageTimestamp(b));

    if (typeof wpp.chat?.getMessages === "function") {
      try {
        const msgs = await wpp.chat.getMessages(chat, { count: -1 });
        if (Array.isArray(msgs) && msgs.length) return msgs;
      } catch {
        /* no more history available through either path */
      }
    }
    return [];
  }

  async function listGroupChats(wpp, ids) {
    let chats = [];
    try {
      chats = (await wpp.chat.list({ onlyGroups: true })) || [];
    } catch {
      chats = ((await wpp.chat.list()) || []).filter((chat) => widString(chat.id).endsWith("@g.us"));
    }
    if (ids?.size) return chats.filter((chat) => ids.has(widString(chat.id)));
    return chats;
  }

  async function exportChatMessages(wpp, chats, onProgress) {
    const messages = [];
    let skippedChats = 0;
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      const chatId = widString(chat.id);
      const title = chatTitle(chat);
      const isGroup = isGroupChat(chat);
      onProgress(i, chats.length, title);
      try {
        const msgs = await getChatMessages(wpp, chat);
        if (!msgs.length) {
          skippedChats += 1;
          continue;
        }
        for (const msg of msgs) {
          const type = msgType(msg);
          if (type === "e2e_notification" || type === "gp2" || type === "notification_template") continue;
          const text = msgBody(msg);
          const fromMe = msgFromMe(msg);
          messages.push({
            chat: title,
            chatId,
            date: formatDate(msg.t ?? safeGet(msg, "t")),
            from: fromMe ? tInj("me") : msgSenderLabel(msg, title, isGroup),
            fromMe,
            type,
            message: text || `[${type}]`,
          });
        }
      } catch {
        skippedChats += 1;
      }
      onProgress(i + 1, chats.length, title);
    }
    messages.sort((a, b) => `${a.date}${a.chat}`.localeCompare(`${b.date}${b.chat}`));
    return { kind: "messages", messages, scanned: chats.length, skipped: skippedChats };
  }

  async function exportSelection(payload, onProgress) {
    const wpp = await waitForWpp();
    const tab = payload.tab;
    let ids = (payload.ids || []).map(String);
    if (payload.all) ids = await allIdsForTab(wpp, tab);
    const idSet = new Set(ids);
    const kind = exportKind(tab, payload);

    if (kind === "messages") {
      let chats = [];
      if (tab === "chats") {
        const all = await listUserChats(wpp);
        chats = payload.all
          ? all
          : all.filter((chat) => idSet.has(widString(chat.id)) || idSet.has(widString(chat.contact?.id)));
      } else {
        chats = await listGroupChats(wpp, payload.all ? null : idSet);
      }
      return exportChatMessages(wpp, chats, onProgress);
    }

    const dedupe = payload.dedupe !== false;
    const simple = !!payload.simple;
    const rows = [];
    let skipped = 0;
    let scanned = 0;

    const pushMapped = async (contact, extra) => {
      scanned += 1;
      const row = await toRow(wpp, contact, extra);
      if (row.skipped) skipped += 1;
      else rows.push(row);
    };

    if (tab === "contacts") {
      const all = (await wpp.contact.list()) || [];
      const selected = all.filter((contact) => idSet.has(widString(contact.id)));
      let done = 0;
      await mapPool(selected, 12, async (contact) => {
        await pushMapped(contact, { source: simple ? "" : tInj("addressBook") });
        done += 1;
        if (done % 20 === 0 || done === selected.length) onProgress(done, selected.length, tInj("addressBook"));
      });
    } else if (tab === "groups") {
      const chats = (await wpp.chat.list({ onlyGroups: true, ignoreGroupMetadata: true })) || [];
      const titles = new Map(chats.map((chat) => [widString(chat.id), chatTitle(chat)]));
      const groupIds = [...idSet];
      let done = 0;
      for (const groupId of groupIds) {
        const title = titles.get(groupId) || groupId;
        onProgress(done, groupIds.length, title);
        const members = await getGroupMembers(wpp, groupId);
        await mapPool(members, 12, async (part) => {
          await pushMapped(participantContact(part), {
            source: simple ? "" : tInj("group"),
            group: simple ? "" : title,
            admin: participantAdmin(part),
          });
        });
        done += 1;
        onProgress(done, groupIds.length, title);
      }
    } else if (tab === "labels") {
      const all = (await wpp.contact.list()) || [];
      const selected = all.filter(
        (contact) => Array.isArray(contact.labels) && contact.labels.some((label) => idSet.has(String(label)))
      );
      let done = 0;
      await mapPool(selected, 12, async (contact) => {
        await pushMapped(contact, { source: simple ? "" : tInj("label") });
        done += 1;
        if (done % 20 === 0 || done === selected.length) onProgress(done, selected.length, tInj("label"));
      });
    }

    const contacts = mergeRows(rows, dedupe).sort((a, b) =>
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
    );
    return { kind: "contacts", contacts, skipped, scanned };
  }

  waitForWpp()
    .then(() => post({ type: STATUS, ready: true }))
    .catch((error) => post({ type: STATUS, ready: false, error: error.message }));

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data.lang && I18N_INJ[data.lang]) currentLang = data.lang;

    if (data.type === HELLO) {
      post({ type: STATUS, ready: !!pickReadyWpp(), error: "" });
      return;
    }

    if (data.type === CATALOG) {
      try {
        const items = await catalog(data.tab || "contacts");
        post({ type: CATALOG_RES, id: data.id, ok: true, tab: data.tab, items });
      } catch (error) {
        post({ type: CATALOG_RES, id: data.id, ok: false, error: error?.message || String(error) });
      }
      return;
    }

    const runExport = async (payload) => {
      const result = await exportSelection(payload, (current, total, label) => {
        post({ type: PROGRESS, id: payload.id, current, total, label });
      });
      post({ type: RUN_RES, id: payload.id, ok: true, ...result });
    };

    if (data.type === QUICK || data.type === RUN) {
      try {
        await runExport(data);
      } catch (error) {
        post({ type: RUN_RES, id: data.id, ok: false, error: error?.message || String(error) });
      }
    }
  });
})();
