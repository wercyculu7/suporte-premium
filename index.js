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

app.get('/', (req, res) => {
    res.send('API do Sistema de Suporte Premium Online.');
});

// --- ROTA 1: WEBHOOK PARA O PRODUTO "MEU SUPORTE" (VERSÃO INTELIGENTE) ---
app.post('/webhook-meu-suporte', async (req, res) => {
    const evento = req.body;
    const { order_status, Customer } = evento;
    const emailCliente = Customer.email.toLowerCase();

    console.log(`Webhook de Suporte recebido para o e-mail ${emailCliente}, Status ${order_status}`);

    if (order_status === 'paid') {
        try {
            // PASSO 1: Encontrar o ID de compra original do cliente na tabela 'compras'.
            // Buscamos o registro mais antigo associado ao e-mail.
            const clienteExistente = await pool.query(
                'SELECT id_compra FROM compras WHERE email_cliente = $1 ORDER BY data_criacao ASC LIMIT 1',
                [emailCliente]
            );

            if (clienteExistente.rowCount === 0) {
                console.error(`[SUPORTE PREMIUM] ERRO: Cliente com e-mail ${emailCliente} não encontrado na tabela 'compras'. Não foi possível ativar o suporte.`);
                return res.status(404).send('Cliente original não encontrado.');
            }

            const idRevendedorOriginal = clienteExistente.rows[0].id_compra;
            console.log(`ID original do revendedor encontrado: ${idRevendedorOriginal}`);

            // PASSO 2: Inserir o ID ORIGINAL na tabela de suporte premium.
            await pool.query(
                'INSERT INTO revendedores_premium (id_revendedor, email_revendedor) VALUES ($1, $2) ON CONFLICT (id_revendedor) DO NOTHING',
                [idRevendedorOriginal, emailCliente]
            );
            console.log(`[SUPORTE PREMIUM] Revendedor ${idRevendedorOriginal} adicionado/confirmado na lista de suporte.`);
        
        } catch (error) {
            console.error('[SUPORTE PREMIUM] Erro ao processar compra:', error);
        }
    } else if (order_status === 'refunded' || order_status === 'chargeback') {
        try {
            // Em caso de reembolso, precisamos remover o ID original da lista premium.
            const clienteExistente = await pool.query(
                'SELECT id_compra FROM compras WHERE email_cliente = $1 ORDER BY data_criacao ASC LIMIT 1',
                [emailCliente]
            );

            if (clienteExistente.rowCount > 0) {
                const idRevendedorOriginal = clienteExistente.rows[0].id_compra;
                await pool.query('DELETE FROM revendedores_premium WHERE id_revendedor = $1', [idRevendedorOriginal]);
                console.log(`[SUPORTE PREMIUM] Acesso de ${idRevendedorOriginal} removido por reembolso/chargeback.`);
            }
        } catch (error) {
            console.error('[SUPORTE PREMIUM] Erro ao remover acesso:', error);
        }
    }
    
    res.status(200).send('Webhook de suporte recebido.');
});


// --- ROTA 2: VERIFICAÇÃO PARA A PÁGINA DE SUPORTE (INTOCADA) ---
app.get('/verificar-suporte', async (req, res) => {
    const idRevendedor = req.query.id;

    if (!idRevendedor) {
        return res.status(400).json({ autorizado: false, erro: 'ID não fornecido' });
    }

    try {
        const queryResult = await pool.query(
            "SELECT 1 FROM revendedores_premium WHERE id_revendedor = $1 AND status_suporte = 'ativo'",
            [idRevendedor.toLowerCase()]
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


// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor de Suporte Premium rodando na porta ${port}`);
});
