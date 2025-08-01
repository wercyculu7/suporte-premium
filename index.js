// suporte-premium/index.js (VERSÃO FINAL - Respeita o case do banco)
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

app.post('/webhook-meu-suporte', async (req, res) => {
    const evento = req.body;
    const { order_status, Customer } = evento;
    const emailCliente = Customer.email.toLowerCase();

    console.log(`Webhook de Suporte recebido para ${emailCliente}, Status: ${order_status}`);

    const statusPositivos = ['paid', 'approved'];
    const statusNegativos = ['refunded', 'chargeback', 'canceled', 'expired', 'failed'];

    try {
        const clienteExistente = await pool.query(
            'SELECT id_compra FROM compras WHERE email_cliente = $1 ORDER BY data_criacao ASC LIMIT 1',
            [emailCliente]
        );

        if (clienteExistente.rowCount === 0) {
            console.error(`[SUPORTE PREMIUM] ERRO: Cliente com e-mail ${emailCliente} não encontrado na tabela 'compras'.`);
            return res.status(404).send('Cliente original não encontrado.');
        }

        // AQUI ESTÁ A MUDANÇA IMPORTANTE: Pegamos o ID exatamente como ele está no banco
        const idRevendedorOriginal = clienteExistente.rows[0].id_compra;
        console.log(`ID original do revendedor encontrado: ${idRevendedorOriginal}`);

        if (statusPositivos.includes(order_status)) {
            await pool.query(
                'INSERT INTO revendedores_premium (id_revendedor, email_revendedor) VALUES ($1, $2) ON CONFLICT (id_revendedor) DO NOTHING',
                [idRevendedorOriginal, emailCliente]
            );
            console.log(`[SUPORTE PREMIUM] ACESSO ATIVADO/MANTIDO para ${idRevendedorOriginal}.`);
        
        } else if (statusNegativos.includes(order_status)) {
            await pool.query('DELETE FROM revendedores_premium WHERE id_revendedor = $1', [idRevendedorOriginal]);
            console.log(`[SUPORTE PREMIUM] ACESSO REMOVIDO para ${idRevendedorOriginal} devido ao status: ${order_status}.`);
        }

    } catch (error) {
        console.error(`[SUPORTE PREMIUM] Erro crítico ao processar webhook para ${emailCliente}:`, error);
    }
    
    res.status(200).send('Webhook de suporte recebido e processado.');
});

app.get('/verificar-suporte', async (req, res) => {
    const idRevendedor = req.query.id;

    if (!idRevendedor) {
        return res.status(400).json({ autorizado: false, erro: 'ID não fornecido' });
    }

    try {
        // <<< AQUI ESTÁ A CORREÇÃO PRINCIPAL >>>
        // Removemos o .toLowerCase(). Agora a busca respeita maiúsculas e minúsculas.
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
