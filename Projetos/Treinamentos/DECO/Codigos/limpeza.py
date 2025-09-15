import pandas as pd

DATA_URL = r"C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\dados.csv"
df = pd.read_csv(DATA_URL)

estados = ['customer_state', 'seller_state']  
for column in estados:
    df[column] = df[column].replace({'sao paulo': 'SP', 'SAO PAULO': 'SP'})
    df[column] = df[column].replace({'minas': 'MG', 'minas': 'MG'})

cidades = ['customer_city', 'seller_city']  
for column in cidades:
    df[column] = df[column].str.lower().replace({
        'riberao preto': 'ribeirao preto',
        'sao  paulo': 'sao paulo',
        's jose do rio preto': 'sao jose do rio preto',
        'piumhii': 'piumhi',
        'sp': 'sao paulo',
        'sao paulo - sp': 'sao paulo',
        'mogi-guacu': 'mogi guacu',
        'mogi mirim': 'moji mirim',
        'andira-pr': 'andira',
        'scao jose do rio pardo': 'sao jose do rio pardo',
        'santa barbara d oeste': 'santa barbara d oeste',
        'santa barbara d\'oeste': 'santa barbara d oeste',
        'santa barbara d´oeste': 'santa barbara d oeste',
        'santa barbara d\' oeste': 'santa barbara d oeste'
    })
    
df = df.drop_duplicates(subset='order_id', keep='first')
df.drop('freight_value', axis=1, inplace=True)

Q1 = df.groupby('customer_state')['delivery_time'].quantile(0.25)
Q3 = df.groupby('customer_state')['delivery_time'].quantile(0.75)
IQR = Q3 - Q1
lower_bound = Q1 - 1.5 * IQR
upper_bound = Q3 + 1.5 * IQR

mask = df.apply(lambda row: row['delivery_time'] >= lower_bound.get(row['customer_state'], float('-inf')) and row['delivery_time'] <= upper_bound.get(row['customer_state'], float('inf')), axis=1)
df = df[mask]

df.to_csv(r"C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\dados_limpos.csv", index=False)