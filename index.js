const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

const fs = require('fs');

const TOKEN = process.env.TOKEN;

// CONFIG
const CARTELLINO_CHANNEL = "1496781775849000970";
const MULTE_CHANNEL = "1496125333500465162";
const LOG_CHANNEL = "1496616270265581641";

const STAFF_ROLE_1 = "1496122762354229299";
const STAFF_ROLE_2 = "1496613807953416202";

const CLIENT_ID = "1496607395785343016";
const GUILD_ID = "1496119913000206447";

// DATABASE
const DB_FILE = "./database.json";
let data = {};

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
}

function saveData() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) {
    data[id] = {
      ore: 0,
      start: null,
      multe: [],
      totaleMulte: 0
    };
  }
  return data[id];
}

function isStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_1) || member.roles.cache.has(STAFF_ROLE_2);
}

function formatTime(ms) {
  let s = Math.floor(ms / 1000);
  let h = Math.floor(s / 3600);
  s %= 3600;
  let m = Math.floor(s / 60);
  s %= 60;
  return `${h}h ${m}m ${s}s`;
}

const inServizio = new Set();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// READY
client.once(Events.ClientReady, async () => {
  console.log("Bot online");

  const cartellino = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('timbra').setLabel('Entra').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('stimbra').setLabel('Esci').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ore').setLabel('Ore').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('servizio').setLabel('Servizio').setStyle(ButtonStyle.Secondary)
  );

  const multe = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('multa').setLabel('Multa').setStyle(ButtonStyle.Danger)
  );

  (await client.channels.fetch(CARTELLINO_CHANNEL)).send({ content: "Cartellino", components: [cartellino] });
  (await client.channels.fetch(MULTE_CHANNEL)).send({ content: "Multe", components: [multe] });
});

// INTERAZIONI
client.on(Events.InteractionCreate, async interaction => {

  const id = interaction.user.id;
  const userData = getUser(id);

  // BOTTONI
  if (interaction.isButton()) {

    if (interaction.customId === "timbra") {
      if (userData.start)
        return interaction.reply({ content: "Già in servizio", ephemeral: true });

      userData.start = Date.now();
      inServizio.add(id);
      saveData();

      return interaction.reply({ content: "Entrato in servizio", ephemeral: true });
    }

    if (interaction.customId === "stimbra") {
      if (!userData.start)
        return interaction.reply({ content: "Non in servizio", ephemeral: true });

      const durata = Date.now() - userData.start;
      userData.ore += durata;
      userData.start = null;
      inServizio.delete(id);
      saveData();

      return interaction.reply({ content: `Turno: ${formatTime(durata)}`, ephemeral: true });
    }

    if (interaction.customId === "ore") {
      let totale = userData.ore;
      if (userData.start) totale += Date.now() - userData.start;

      return interaction.reply({ content: `Ore: ${formatTime(totale)}`, ephemeral: true });
    }

    if (interaction.customId === "servizio") {
      const lista = [...inServizio].map(x => `<@${x}>`).join("\n") || "Nessuno";
      return interaction.reply({ content: lista, ephemeral: true });
    }

    if (interaction.customId === "multa") {

      const modal = new ModalBuilder()
        .setCustomId("multa_form")
        .setTitle("Multa LSPD");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('utente')
            .setLabel("Tag collega (@utente)")
            .setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('motivo')
            .setLabel("Motivo")
            .setStyle(TextInputStyle.Paragraph)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('importo')
            .setLabel("Importo")
            .setStyle(TextInputStyle.Short)
        )
      );

      return interaction.showModal(modal);
    }
  }

  // MODULO MULTA
  if (interaction.isModalSubmit()) {

    const targetId = interaction.fields.getTextInputValue('utente').replace(/[<@!>]/g, "");
    const motivo = interaction.fields.getTextInputValue('motivo');
    const importo = parseInt(interaction.fields.getTextInputValue('importo')) || 0;

    const target = getUser(targetId);

    const multa = {
      id: Date.now(),
      agente: id,
      motivo,
      importo
    };

    target.multe.push(multa);
    target.totaleMulte += importo;

    saveData();

    (await client.channels.fetch(LOG_CHANNEL)).send(`
Agente: <@${id}>
Collega: <@${targetId}>
Importo: ${importo}
Motivo: ${motivo}
`);

    return interaction.reply({ content: "Multa mandata", ephemeral: true });
  }

  // COMANDI
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "info") {
      const user = interaction.options.getUser("utente");
      const d = getUser(user.id);

      return interaction.reply(`
Utente: ${user}

Ore: ${formatTime(d.ore)}
Totale multe: ${d.totaleMulte}
Numero multe: ${d.multe.length}
`);
    }

    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: "Non autorizzato", ephemeral: true });
    }

    if (interaction.commandName === "togliore") {
      const user = interaction.options.getUser("utente");
      const ore = interaction.options.getInteger("ore");

      const d = getUser(user.id);
      d.ore -= ore * 3600000;
      if (d.ore < 0) d.ore = 0;

      saveData();
      return interaction.reply("Ore aggiornate");
    }

    if (interaction.commandName === "forzastop") {
      const user = interaction.options.getUser("utente");
      const d = getUser(user.id);

      if (d.start) {
        const durata = Date.now() - d.start;
        d.ore += durata;
        d.start = null;
      }

      saveData();
      return interaction.reply("Cartellino chiuso");
    }
  }
});

// SLASH COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Mostra statistiche")
    .addUserOption(o => o.setName("utente").setDescription("Utente").setRequired(true)),

  new SlashCommandBuilder()
    .setName("togliore")
    .setDescription("Togli ore")
    .addUserOption(o => o.setName("utente").setDescription("Utente").setRequired(true))
    .addIntegerOption(o => o.setName("ore").setDescription("Ore").setRequired(true)),

  new SlashCommandBuilder()
    .setName("forzastop")
    .setDescription("Chiudi cartellino")
    .addUserOption(o => o.setName("utente").setDescription("Utente").setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
})();

client.login(TOKEN);