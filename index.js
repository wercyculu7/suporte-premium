// suporte-premium/index.js (VERSÃO FINAL - Lógica de Atraso Inteligente)
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função para esperar um tempo (em milissegundos)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para tentar encontrar o ID principal do cliente
async function findMainPurchaseId(email) {
    const result = await pool.query(
        'SELECT id_compra FROM compras WHERE email_cliente = $1 ORDER BY data_criacao ASC LIMIT 1',
        [email]
    );
    if (result.rowCount > 0) {
        return result.rows[0].id_compra;
    }
    return null;
}

app.get('/', (req, res) => {
    res.send('API do Sistema de Suporte Premium Online (v.AtrasoInteligente).');
});

// ROTA 1: WEBHOOK PARA O PRODUTO "MEU SUPORTE"
app.post('/webhook-meu-suporte', async (req, res) => {
    const evento = req.body;
    const { order_status, Customer } = evento;
    const emailCliente = Customer.email.toLowerCase();

    console.log(`Webhook de Suporte recebido para ${emailCliente}, Status: ${order_status}`);

    // Responde imediatamente à Kiwify para evitar timeouts
    res.status(200).send('Webhook de suporte recebido. Processando em segundo plano.');

    // --- Inicia o processamento em segundo plano ---
    try {
        const statusPositivos = ['paid', 'approved'];
        const statusNegativos = ['refunded', 'chargeback', 'canceled', 'expired', 'failed'];

        if (statusPositivos.includes(order_status)) {
            let idRevendedorOriginal = await findMainPurchaseId(emailCliente);

            // Se não encontrou, é provável que seja um Order Bump. Espera e tenta de novo.
            if (!idRevendedorOriginal) {
                console.log(`ID principal não encontrado para ${emailCliente}. Provável Order Bump. Aguardando 60 segundos...`);
                await sleep(60000); // Espera 60 segundos
                idRevendedorOriginal = await findMainPurchaseId(emailCliente);
                console.log(`Segunda tentativa para ${emailCliente}...`);
            }

            if (idRevendedorOriginal) {
                console.log(`ID principal encontrado: ${idRevendedorOriginal}. Ativando suporte.`);
                await pool.query(
                    'INSERT INTO revendedores_premium (id_revendedor, email_revendedor) VALUES ($1, $2) ON CONFLICT (id_revendedor) DO NOTHING',
                    [idRevendedorOriginal, emailCliente]
                );
                console.log(`[SUPORTE PREMIUM] ACESSO ATIVADO para ${idRevendedorOriginal}.`);
            } else {
                console.error(`[SUPORTE PREMIUM] ERRO CRÍTICO: Mesmo após a espera, não foi possível encontrar um ID de compra principal para o e-mail ${emailCliente}.`);
            }
        
        } else if (statusNegativos.includes(order_status)) {
            const idRevendedorOriginal = await findMainPurchaseId(emailCliente);
            if (idRevendedorOriginal) {
                await pool.query('DELETE FROM revendedores_premium WHERE id_revendedor = $1', [idRevendedorOriginal]);
                console.log(`[SUPORTE PREMIUM] ACESSO REMOVIDO para ${idRevendedorOriginal} devido ao status: ${order_status}.`);
            }
        }
    } catch (error) {
        console.error(`[SUPORTE PREMIUM] Erro crítico no processamento em segundo plano para ${emailCliente}:`, error);
    }
});

// ROTA 2: VERIFICAÇÃO DE SUPORTE POR CÓDIGO (INTOCADA)
app.get('/verificar-suporte', async (req, res) => {
    const idRevendedor = req.query.id;
    if (!idRevendedor) {
        return res.status(400).json({ autorizado: false, erro: 'ID não fornecido' });
    }
    try {
        const queryResult = await pool.query(
            "SELECT 1 FROM revendedores_premium WHERE id_revendedor = $1",
            [idRevendedor] 
        );
        if (queryResult.rowCount > 0) {
            return res.json({ autorizado: true });
        } else {
            return res.json({ autorizado: false });
        }
    } catch (error) {
        console.error('Erro na rota /verificar-suporte:', error);
        return res.status(500).json({ autorizado: false, erro: 'Erro interno do servidor' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor de Suporte Premium rodando na porta ${port}`);
});
