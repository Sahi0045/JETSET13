import { Resend } from 'resend';

const resend = new Resend('re_4tfvwTmv_9kPKorQAcpZmZcZ4i744cC1Q');

async function test() {
    console.log('Sending test email...');
    try {
        const data = await resend.emails.send({
            from: 'Jetsetters <noreply@jetsetterss.com>',
            to: 'shubhamkush012@gmail.com',
            subject: 'Resend API Key Test',
            html: '<p>Testing the Resend API key.</p>'
        });
        console.log('Success:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
