// Emojis mais usados, por categoria. Lista fixa para não pesar o app com uma biblioteca.
const lista = (s) => s.split(" ");

export const CATEGORIAS_EMOJI = [
  { nome: "Carinhas", icone: "😀", emojis: lista("😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖") },
  { nome: "Gestos", icone: "👍", emojis: lista("👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 🧠 🫶 💅 🤳") },
  { nome: "Corações", icone: "❤️", emojis: lista("❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎁 🏆 🥇") },
  { nome: "Pessoas", icone: "🙋", emojis: lista("👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙋 🙋‍♂️ 🙋‍♀️ 🙆 🙅 💁 🤷 🤦 🙇 👷 👷‍♂️ 👷‍♀️ 🧑‍🔧 👨‍🔧 👩‍🔧 🧑‍💼 👨‍💼 👩‍💼 🧑‍💻 🏃 🚶 👪 👫 🤰") },
  { nome: "Natureza", icone: "☀️", emojis: lista("☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌈 🌙 🌎 🌱 🌿 🍀 🌳 🌴 🌵 🌻 🌼 🌷 🌹 🍃 🍂 💧 🌊 ❄️ 🔋 🐶 🐱 🐔 🐦 🐝 🦋") },
  { nome: "Comida", icone: "☕", emojis: lista("☕ 🍵 🥤 🧃 🍺 🍻 🥂 🍷 🍕 🍔 🍟 🌭 🥪 🌮 🍝 🍛 🍲 🥗 🍗 🍖 🥩 🍤 🍣 🍰 🎂 🍫 🍩 🍪 🍎 🍌 🍉 🍇 🍓 🥭 🍍 🥥") },
  { nome: "Objetos", icone: "💡", emojis: lista("💡 🔌 🔋 ⚡ 🏠 🏡 🏢 🏭 🏗️ 🚗 🚚 🛻 🔧 🔨 🪛 ⚙️ 🧰 📱 💻 🖥️ 📷 📞 ☎️ 📧 ✉️ 📩 📄 📃 📑 📊 📈 📉 🗂️ 📁 📅 📆 🗓️ 📌 📍 📎 ✏️ 📝 🔑 🔒 💰 💵 💸 💳 🧾 🏦") },
  { nome: "Símbolos", icone: "✅", emojis: lista("✅ ☑️ ✔️ ❌ ❎ ⚠️ 🚫 ⛔ ❗ ❓ ‼️ ⁉️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 ⬆️ ⬇️ ➡️ ⬅️ 🔝 🆗 🆕 🆓 🔟 ⏰ ⏳ 🕐 ♻️ ➕ ➖ ✖️ ➗ 💲") },
];

// Reações rápidas, como no WhatsApp.
export const REACOES_RAPIDAS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const CHAVE_RECENTES = "crm-emojis-recentes";

export function emojisRecentes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES)) ?? []; } catch { return []; }
}

export function guardarRecente(emoji) {
  try {
    const nova = [emoji, ...emojisRecentes().filter((e) => e !== emoji)].slice(0, 24);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(nova));
  } catch { /* navegador sem storage */ }
}
