import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import xgboost as xgb
from sklearn.linear_model import LinearRegression


# Load the datasets
test_data_path = r'C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\Modelo 2\teste2_FULL.csv'
train_data_path = r'C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\Modelo 2\dados_completos - Copy.csv'

train_data = pd.read_csv(train_data_path)
test_data = pd.read_csv(test_data_path)

def remove_outliers(df, column):
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 3 * IQR
    upper_bound = Q3 + 3 * IQR
    return df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]

# Remove outliers
columns_to_clean = ['delivery_time', 'TimeToApprove']
for column in columns_to_clean:
    train_data = remove_outliers(train_data, column)

# Drop duplicates and missing values
train_data = train_data.drop_duplicates('order_id', keep='first').dropna(subset=columns_to_clean)

# Remove instances with delivery times higher than a certain threshold
threshold = train_data['delivery_time'].quantile(0.85)
train_data = train_data[train_data['delivery_time'] <= threshold]

# Feature selection
numerical_features = ['TimeToApprove']
unwanted_columns = ['order_id', 'customer_id', 'order_purchase_timestamp', 'order_approved_at']

# Prepare the test data
filtered_test_data = test_data.drop(unwanted_columns, axis=1)
features_for_prediction = numerical_features
filtered_test_data_prepared = filtered_test_data[features_for_prediction]

# Preprocessing pipeline
preprocessor = ColumnTransformer(
    transformers=[
        ('num', StandardScaler(), numerical_features),
    ])

# Splitting data into train and validation sets
X = train_data[numerical_features]
y = train_data['delivery_time']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Define the pipeline with Linear Regression
pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('model', LinearRegression())  # Use LinearRegression instead of XGBRegressor
])

# Fit the pipeline
pipeline.fit(X_train, y_train)

# Use the fitted pipeline to predict on the test set
test_data['predicted_delivery_time'] = pipeline.predict(filtered_test_data_prepared)

# Cap the predicted delivery times at a certain threshold
cap_value = train_data['delivery_time'].quantile(0.85)
test_data['predicted_delivery_time'] = test_data['predicted_delivery_time'].apply(lambda x: min(x, cap_value))

# Save the predictions
test_data[['order_id', 'predicted_delivery_time']].to_csv(r'C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\Modelo 2\predictions4.csv', index=False)