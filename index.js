const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const SELLFLUX_WEBHOOK = "https://webhook.sellflux.app/webhook/sellflux/lead/d800c6cf5d304e013ec4f95ab772d62e";

// Endpoint para receber notificações do PagBank
app.post('/webhook/pagbank', async (req, res) => {
    try {
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

        // Mapear método de pagamento
        let paymentMethod;
        switch(charge.payment_method.type) {
            case 'CREDIT_CARD':
                paymentMethod = 'cartao-credito';
                break;
            case 'PIX':
                paymentMethod = 'pix';
                break;
            case 'BOLETO':
                paymentMethod = 'boleto';
                break;
            default:
                paymentMethod = charge.payment_method.type.toLowerCase();
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
            url: charge.payment_response_code || '',
            payment_method: paymentMethod,
            expiration_date: charge.payment_method.boleto?.due_date || charge.payment_method.pix?.expiration_date || null,
            product_id: items[0]?.reference_id || '',
            product_name: items[0]?.name || '',
            transaction_value: (charge.amount.value / 100).toString(),
            tags: ['pagamento-pagbank']
        };

        // Enviar para o Sellflux
        const response = await axios.post(SELLFLUX_WEBHOOK, sellfluxData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Notificação enviada com sucesso para Sellflux:', reference_id);
        return res.status(200).send('Webhook processado com sucesso');

    } catch (erro) {
        console.error('Erro ao processar webhook:', erro);
        return res.status(500).send('Erro ao processar webhook');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
