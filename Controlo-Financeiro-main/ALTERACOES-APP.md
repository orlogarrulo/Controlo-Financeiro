# Alterações na app

## Uso
- Cartão: Matrículas → «Cartão de estudante» (imprimir na app)
- Regulamento pais: /regulamento?lang=pt ou ?lang=fr
- Inquérito: /inquerito-saude (nuvem + CSV)
- Agendamento: /agendamento (nuvem + CSV)
- Contacto: 922 637 640

## Deploy Vercel (obrigatório)
1. Confirmar que o repo GitHub tem estes ficheiros (push do ZIP).
2. Vercel → Project → Settings → General:
   - Root Directory: (vazio ou pasta do projecto)
   - Framework Preset: Other
   - Build Command: npm run build
   - Install Command: npm install
3. NÃO definir Output Directory manualmente para dist (a app usa Nitro → .vercel/output).
4. Redeploy. O build deve demorar minutos, não ~100 ms.
5. Se a homepage continuar 404, em Deployments apagar o deploy vazio e fazer Redeploy do commit correcto.
