# Configuração de Ambiente e Chaves de API

Este projeto utiliza **Google Apps Script**. Para garantir a segurança das chaves de API e permitir o versionamento do código (commit) sem vazar credenciais, as chaves foram removidas do código fonte e devem ser configuradas nas **Propriedades do Script**.

## Como configurar as chaves

1. Abra o projeto no **Google Apps Script Editor**.
2. Vá em **Configurações do Projeto** (ícone de engrenagem ⚙️ na barra lateral esquerda).
3. Role até a seção **Propriedades do script**.
4. Clique em **Editar propriedades do script**.
5. Adicione as seguintes propriedades com seus respectivos valores:

| Propriedade            |
|------------------------|
| `PIPEDRIVE_API_TOKEN`  | 
| `GEMINI_API_KEY`       | 
| `OPENAI_API_KEY`       |

6. Salve as propriedades.

## Uso no Código

O código agora acessa essas chaves utilizando o serviço de propriedades:
```javascript
const value = PropertiesService.getScriptProperties().getProperty('KEY_NAME');
```