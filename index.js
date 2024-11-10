const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const SELLFLUX_WEBHOOK = "https://webhook.sellflux.app/webhook/sellflux/lead/d800c6cf5d304e013ec4f95ab772d62e";
const PAGBANK_PUBLIC_KEY = process.env.PAGBANK_PUBLIC_KEY;
const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;

// Endpoint para receber notificações do PagBank
app.post('/webhook/pagbank', async (req, res) => {
    try {
        // Verificar assinatura do webhook se existir
        const signature = req.headers['x-signature'];
        if (signature) {
            const hmac = crypto.createHmac('sha256', PAGBANK_TOKEN);
            const calculatedSignature = hmac.update(JSON.stringify(req.body)).digest('hex');
            if (calculatedSignature !== signature) {
                console.error('Assinatura inválida do webhook');
                return res.status(401).send('Assinatura inválida');
            }
        }

        // Extrair dados do PagBank
        const {
            charges,
            customer,
            reference_id,
            items
        } = req.body;

        // Pegar o status do pagamento
        const charge = charges[0];
        let sellfluxStatus;

        // Mapear status do PagBank para status do Sellflux
        switch(charge.status) {
            case 'PAID':
            case 'AUTHORIZED':
                sellfluxStatus = 'compra-realizada';
                break;
            case 'DECLINED':
            case 'CANCELED':
                sellfluxStatus = 'cancelado';
                break;
            case 'WAITING':
                sellfluxStatus = 'aguardando-pagamento';
                break;
            default:
                sellfluxStatus = 'aguardando-pagamento';
        }

        // Preparar dados para o Sellflux no formato correto
        const sellfluxData = {
            name: customer.name,
            email: customer.email,
            phone: customer.phones[0]?.full_number || '',
            gateway: 'pagbank',
            transaction_id: reference_id,
            offer_id: items[0]?.reference_id || '',
            status: sellfluxStatus,
            payment_date: charge.paid_at || new Date().toISOString(),
            payment_method: charge.payment_method.type.toLowerCase(),
            url: charge.payment_response_code || '',
            expiration_date: charge.payment_method.boleto?.due_date || charge.payment_method.pix?.expiration_date || null,
            product_id: items[0]?.reference_id || '',
            product_name: items[0]?.name || '',
            transaction_value: (charge.amount.value / 100).toString(),
            tags: ['pagamento-pagbank']
        };

        // Enviar para o Sellflux
        console.log('Enviando dados para Sellflux:', sellfluxData);
        const response = await axios.post(SELLFLUX_WEBHOOK, sellfluxData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Resposta do Sellflux:', response.data);
        return res.status(200).send('Webhook processado com sucesso');

    } catch (erro) {
        console.error('Erro ao processar webhook:', erro);
        return res.status(500).send('Erro ao processar webhook');
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Serviço de integração PagBank-Sellflux está ativo');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
