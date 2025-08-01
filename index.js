const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080; // Usará a porta que a Railway designar

app.use(cors());
app.use(express.json());

// Conexão com o MESMO banco de dados, mas para usar a NOVA tabela
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- ROTA DE TESTE ---
app.get('/', (req, res) => {
    res.send('API do Sistema de Suporte Premium Online.');
});

// --- ROTA 1: WEBHOOK PARA O PRODUTO "MEU SUPORTE" ---
app.post('/webhook-meu-suporte', async (req, res) => {
    const evento = req.body;
    const { order_ref, order_status, Customer } = evento;

    console.log(`Webhook de Suporte recebido: ID ${order_ref}, Status ${order_status}`);

    if (order_status === 'paid') {
        try {
            const idRevendedor = order_ref.toLowerCase();
            const emailRevendedor = Customer.email.toLowerCase();
            
            // Insere o ID do revendedor na nossa nova tabela
            await pool.query(
                'INSERT INTO revendedores_premium (id_revendedor, email_revendedor) VALUES ($1, $2) ON CONFLICT (id_revendedor) DO NOTHING',
                [idRevendedor, emailRevendedor]
            );
            console.log(`[SUPORTE PREMIUM] Revendedor ${idRevendedor} adicionado/confirmado.`);
        
        } catch (error) {
            console.error('[SUPORTE PREMIUM] Erro ao processar compra:', error);
        }
    } else if (order_status === 'refunded' || order_status === 'chargeback') {
        try {
            const idRevendedor = order_ref.toLowerCase();
            // Remove o revendedor da tabela em caso de reembolso
            await pool.query('DELETE FROM revendedores_premium WHERE id_revendedor = $1', [idRevendedor]);
            console.log(`[SUPORTE PREMIUM] Acesso de ${idRevendedor} removido por reembolso/chargeback.`);
        } catch (error) {
            console.error('[SUPORTE PREMIUM] Erro ao remover acesso:', error);
        }
    }
    
    res.status(200).send('Webhook de suporte recebido.');
});


// --- ROTA 2: VERIFICAÇÃO PARA A PÁGINA DE SUPORTE ---
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
            // Encontrou o revendedor e ele está ativo
            return res.json({ autorizado: true });
        } else {
            // Não encontrou ou não está ativo
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
