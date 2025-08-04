// suporte-premium/index.js (VERSÃO FINAL - Lógica de Data de Expiração)
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
    res.send('API do Sistema de Suporte Premium Online (v.Expiracao).');
});

// =================================================================
// === INÍCIO DA ALTERAÇÃO PRINCIPAL ===============================
// =================================================================
// ROTA DE VERIFICAÇÃO DE SUPORTE (AGORA COM LÓGICA DE EXPIRAÇÃO)
app.get('/verificar-suporte', async (req, res) => {
    const idRevendedor = req.query.id;
    if (!idRevendedor) {
        return res.status(400).json({ autorizado: false, erro: 'ID não fornecido' });
    }
    try {
        // ESTA É A NOVA CONSULTA INTELIGENTE
        // Ela verifica se o ID existe E se a data de expiração é NULA (para clientes antigos sem data)
        // OU se a data de expiração é maior que a data/hora atual.
        const queryResult = await pool.query(
            `SELECT 1 FROM revendedores_premium 
             WHERE id_revendedor = $1 
             AND (data_expiracao IS NULL OR data_expiracao > NOW())`,
            [idRevendedor] 
        );

        if (queryResult.rowCount > 0) {
            console.log(`[VERIFICAÇÃO] Suporte APROVADO para o ID: ${idRevendedor}`);
            return res.json({ autorizado: true });
        } else {
            console.log(`[VERIFICAÇÃO] Suporte NEGADO para o ID: ${idRevendedor} (Não encontrado ou expirado)`);
            return res.json({ autorizado: false });
        }
    } catch (error) {
        console.error('Erro na rota /verificar-suporte:', error);
        return res.status(500).json({ autorizado: false, erro: 'Erro interno do servidor' });
    }
});
// =================================================================
// === FIM DA ALTERAÇÃO PRINCIPAL ==================================
// =================================================================


// ROTA DE WEBHOOK (AGORA PREPARADA PARA RENOVAÇÕES FUTURAS)
// Esta rota não é mais o caminho principal para ativar o suporte,
// mas a mantemos caso você queira vender o suporte como um produto avulso no futuro.
app.post('/webhook-meu-suporte', async (req, res) => {
    const evento = req.body;
    const { order_status, Customer } = evento;
    const emailCliente = Customer.email.toLowerCase();

    console.log(`Webhook de Suporte Avulso recebido para ${emailCliente}, Status: ${order_status}`);
    res.status(200).send('Webhook de suporte avulso recebido.');

    if (order_status === 'paid' || order_status === 'approved') {
        const idCompraSuporte = evento.order_ref.toLowerCase();
        try {
            // Ao comprar o suporte avulso, a data de expiração é definida/atualizada para 1 ano a partir de AGORA.
            const query = `
                INSERT INTO revendedores_premium (id_revendedor, email_revendedor, data_expiracao)
                VALUES ($1, $2, NOW() + interval '1 year')
                ON CONFLICT (id_revendedor) 
                DO UPDATE SET 
                    data_expiracao = NOW() + interval '1 year',
                    email_revendedor = EXCLUDED.email_revendedor;
            `;
            await pool.query(query, [idCompraSuporte, emailCliente]);
            console.log(`[SUPORTE AVULSO] Acesso renovado/ativado por 1 ano para o ID: ${idCompraSuporte}`);
        } catch (error) {
            console.error(`[SUPORTE AVULSO] Erro ao processar renovação para ${idCompraSuporte}:`, error);
        }
    }
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor de Suporte Premium rodando na porta ${port}`);
});
