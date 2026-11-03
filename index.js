
import { Client, GatewayIntentBits, Events, SlashCommandBuilder, EmbedBuilder, InteractionContextType } from "discord.js";
import { Player } from "discord-player";
import { DefaultExtractors } from "@discord-player/extractor";
import ffmpegPath from "ffmpeg-static";

// ========================================
// CONFIGURAÇÕES
// ========================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
    console.error("TOKEN não encontrado nas variáveis de ambiente!");
    process.exit(1);
}

if (ffmpegPath) {
    process.env.FFMPEG_PATH = ffmpegPath;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ========================================
// DISCORD PLAYER
// ========================================

const player = new Player(client);

// ========================================
// EMBEDS
// ========================================

function embed(titulo, descricao, cor = 0x5865F2) {
    return new EmbedBuilder()
        .setColor(cor)
        .setTitle(titulo)
        .setDescription(descricao)
        .setTimestamp();
}

// ========================================
// COMANDOS
// ========================================

const commands = [
    new SlashCommandBuilder()
        .setName("play")
        .setDescription("Tocar uma música")
        .addStringOption(option =>
            option.setName("musica")
                .setDescription("Nome ou link da música")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pausar a música"),

    new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Continuar a música"),

    new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Pular a música atual"),

    new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Parar e limpar a fila"),

    new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Desconectar do canal de voz"),

    new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Mostrar a fila de músicas"),

    new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Mostrar a música atual"),

    new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Alterar o volume")
        .addIntegerOption(option =>
            option.setName("valor")
                .setDescription("Volume de 1 até 100")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
].map(command =>
    command.setContexts(InteractionContextType.Guild).toJSON()
);

// ========================================
// EVENTOS DE MÚSICA
// ========================================

player.events.on("playerStart", (queue, track) => {
    console.log(`Tocando: ${track.title}`);

    queue.metadata?.send({
        embeds: [
            embed(
                "🎵 Tocando agora",
                `**[${track.title}](${track.url})**\n\n` +
                `⏱️ Duração: ${track.duration}`,
                0x2ECC71
            ).setThumbnail(track.thumbnail)
        ]
    }).catch(console.error);
});

player.events.on("audioTrackAdd", (queue, track) => {
    console.log(`Adicionada à fila: ${track.title}`);
});

player.events.on("error", (queue, error) => {
    console.error("Erro na fila:", error);
});

player.events.on("playerError", (queue, error) => {
    console.error("Erro na reprodução:", error);
    queue.metadata?.send("❌ Ocorreu um erro ao reproduzir essa música.")
        .catch(() => {});
});

player.events.on("emptyQueue", queue => {
    queue.metadata?.send({
        embeds: [
            embed(
                "📭 Fila finalizada",
                "Todas as músicas foram reproduzidas!",
                0xF1C40F
            )
        ]
    }).catch(() => {});
});

// ========================================
// BOT ONLINE
// ========================================

client.once(Events.ClientReady, async readyClient => {
    console.log(`Bot online: ${readyClient.user.tag}`);

    try {
        await player.extractors.loadMulti(DefaultExtractors);
        console.log("Extratores de música carregados!");

        await readyClient.application.commands.set(commands);
        console.log("Comandos registrados com sucesso!");
    } catch (error) {
        console.error("Erro na inicialização:", error);
    }
});

// ========================================
// INTERAÇÕES
// ========================================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inCachedGuild()) return;

    const guildId = interaction.guildId;
    const command = interaction.commandName;

    try {

        // PLAY
        if (command === "play") {
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({
                    content: "❌ Entre em um canal de voz primeiro!",
                    ephemeral: true
                });
            }

            const musica = interaction.options.getString("musica", true);

            await interaction.deferReply();

            const result = await player.play(voiceChannel, musica, {
                nodeOptions: {
                    metadata: interaction.channel,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 300000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 15000,
                    leaveOnStop: true,
                    bufferingTimeout: 15000
                }
            });

            return interaction.editReply({
                embeds: [
                    embed(
                        "🎶 Música adicionada",
                        `**[${result.track.title}](${result.track.url})**\n` +
                        `⏱️ Duração: ${result.track.duration}`,
                        0x2ECC71
                    ).setThumbnail(result.track.thumbnail)
                ]
            });
        }

        const queue = player.nodes.get(guildId);

        // PAUSE
        if (command === "pause") {
            if (!queue || !queue.isPlaying()) {
                return interaction.reply("❌ Não existe música tocando.");
            }

            queue.node.setPaused(true);

            return interaction.reply({
                embeds: [
                    embed("⏸️ Música pausada", "A reprodução foi pausada.")
                ]
            });
        }

        // RESUME
        if (command === "resume") {
            if (!queue || !queue.node.isPaused()) {
                return interaction.reply("❌ Não existe música pausada.");
            }

            queue.node.setPaused(false);

            return interaction.reply({
                embeds: [
                    embed("▶️ Música retomada", "A reprodução foi retomada.", 0x2ECC71)
                ]
            });
        }

        // SKIP
        if (command === "skip") {
            if (!queue || !queue.isPlaying()) {
                return interaction.reply("❌ Não existe música tocando.");
            }

            queue.node.skip();

            return interaction.reply({
                embeds: [
                    embed("⏭️ Música pulada", "Pulando para a próxima música.")
                ]
            });
        }

        // STOP
        if (command === "stop") {
            if (!queue) {
                return interaction.reply("❌ Não existe fila ativa.");
            }

            queue.delete();

            return interaction.reply({
                embeds: [
                    embed("⏹️ Reprodução encerrada", "A fila foi limpa e o bot desconectado.")
                ]
            });
        }

        // LEAVE
        if (command === "leave") {
            if (!queue) {
                return interaction.reply("❌ Não estou conectado a um canal de voz.");
            }

            queue.delete();

            return interaction.reply({
                embeds: [
                    embed("👋 Desconectado", "Saí do canal de voz.")
                ]
            });
        }

        // QUEUE
        if (command === "queue") {
            if (!queue) {
                return interaction.reply("❌ A fila está vazia.");
            }

            const atual = queue.currentTrack;
            const proximas = queue.tracks.toArray();

            let descricao = "";

            if (atual) {
                descricao += `🎵 **Tocando agora:**\n[${atual.title}](${atual.url})\n\n`;
            }

            if (proximas.length > 0) {
                descricao += "**📃 Próximas músicas:**\n";

                descricao += proximas.slice(0, 10).map((track, index) =>
                    `**${index + 1}.** ${track.title} — ${track.duration}`
                ).join("\n");

                if (proximas.length > 10) {
                    descricao += `\n\nE mais ${proximas.length - 10} músicas...`;
                }
            } else {
                descricao += "Não existem próximas músicas.";
            }

            return interaction.reply({
                embeds: [
                    embed("📃 Fila de músicas", descricao)
                ]
            });
        }

        // NOW PLAYING
        if (command === "nowplaying") {
            if (!queue || !queue.currentTrack) {
                return interaction.reply("❌ Não existe música tocando.");
            }

            const track = queue.currentTrack;

            const musicaEmbed = embed(
                "🎧 Tocando agora",
                `**[${track.title}](${track.url})**\n\n` +
                `⏱️ Duração: ${track.duration}\n` +
                `👤 Solicitada por: ${track.requestedBy?.username || "Desconhecido"}`,
                0x2ECC71
            );

            if (track.thumbnail) {
                musicaEmbed.setThumbnail(track.thumbnail);
            }

            return interaction.reply({ embeds: [musicaEmbed] });
        }

        // VOLUME
        if (command === "volume") {
            if (!queue) {
                return interaction.reply("❌ Não existe música tocando.");
            }

            const valor = interaction.options.getInteger("valor", true);

            queue.node.setVolume(valor);

            return interaction.reply({
                embeds: [
                    embed("🔊 Volume alterado", `O volume agora está em **${valor}%**.`)
                ]
            });
        }

    } catch (error) {
        console.error(`Erro no comando /${command}:`, error);

        const mensagem = "❌ Não foi possível executar esse comando. Verifique se a fonte da música é compatível.";

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(mensagem).catch(() => {});
        } else {
            await interaction.reply({
                content: mensagem,
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// ========================================
// LOGIN
// ========================================

client.login(TOKEN);
