import express from 'express';
import fetch from 'node-fetch'; // Usaremos fetch puro para emular o ChatKit
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/run-workflow', async (req, res) => {
    try {
        const { workflow_id, variables } = req.body;

        if (!workflow_id) {
            return res.status(400).json({ error: "O parâmetro workflow_id é obrigatório." });
        }

        console.log(`[+] Iniciando ChatKit Headless - Workflow: ${workflow_id}`);

        // 1. Inicia Sessão ChatKit no Background atrelando-a ao seu Fluxo Visual
        // Isso herda todos os seus Agentes, Prompts e Modelos configurados no Canvas.
        const sessionRes = await fetch("https://api.openai.com/v1/chatkit/sessions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "OpenAI-Beta": "chatkit_beta=v1",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                workflow: { id: workflow_id },
                user: "gas-polijr" // Identificador de onde veio
            }),
        });

        if (!sessionRes.ok) {
            const errText = await sessionRes.text();
            throw new Error(`Erro ao criar sessão ChatKit: ${errText}`);
        }

        const sessionData = await sessionRes.json();
        const clientSecret = sessionData.client_secret;
        const sessionId = sessionData.id;

        // 2. Transforma as variáveis que chegaram do Pipedrive em um input de texto em formato estruturado
        // Como o ChatKit conversa por texto, injetamos nossas variáveis iniciais como se fosse o primeiro comando do usuário.
        // O modelo lerá a notação JSON em texto corrido e aplicará nos seus prompts.
        const mensagemInicial = JSON.stringify(variables, null, 2);

        // 3. Enviamos a mensagem via Responses API / Endpoint interno do ChatKit
        // O ChatKit aceita requisições atreladas à sessão que já detém a inteligência do Workflow.
        // O SDK React do chatkit chama a API de Responses para criar novas mensagens
        const chatRes = await fetch(`https://api.openai.com/v1/responses`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // O cabeçalho especial que a documentação esconde mas o React SDK usa por baixo dos panos!
                "ChatKit-Client-Secret": clientSecret,
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                // Ao atrelar a sessão, todo o "peso" do modelo e config já estão lá.
                input: mensagemInicial
            })
        });

        if (!chatRes.ok) {
            const errChat = await chatRes.text();
            throw new Error(`Erro ao enviar mensagem pro ChatKit: ${errChat}`);
        }

        const chatData = await chatRes.json();

        // 4. Extraímos o output_text da resposta.
        return res.status(200).json({
            success: true,
            output_text: chatData.output_text || JSON.stringify(chatData)
        });

    } catch (error) {
        console.error("[-] Falha na ponte do ChatKit Headless:", error);
        return res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Ponte Poli-Jr ligada e rodando no Node (Headless ChatKit) na porta ${PORT}`);
});
