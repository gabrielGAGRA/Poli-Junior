import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import xgboost as xgb

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
columns_to_clean = ['delivery_time', 'TimeToApprove', 'ApprovedToCarrier', 'Days_Delivery_CarrierToCustomer', 'distance']
for column in columns_to_clean:
    train_data = remove_outliers(train_data, column)

# Drop duplicates and missing values
train_data = train_data.drop_duplicates('order_id', keep='first').dropna(subset=columns_to_clean)

# Remove instances with delivery times higher than a certain threshold
threshold = train_data['delivery_time'].quantile(0.85)
train_data = train_data[train_data['delivery_time'] <= threshold]

# Feature selection
numerical_features = ['TimeToApprove', 'ApprovedToCarrier']
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

# Define the pipeline
pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('model', xgb.XGBRegressor(use_label_encoder=False, eval_metric='rmse'))
])

# Hyperparameter grid for XGBoost
param_grid = {
    'model__n_estimators': [50, 100, 200],
    'model__max_depth': [3, 5, 7],
    'model__learning_rate': [0.01, 0.1, 0.2],
    'model__subsample': [0.6, 0.8, 1.0],
    'model__colsample_bytree': [0.6, 0.8, 1.0]
}

# GridSearchCV for hyperparameter tuning
grid_search = GridSearchCV(pipeline, param_grid, cv=3, scoring='neg_mean_squared_error', verbose=1, n_jobs=-1)
grid_search.fit(X_train, y_train)

# Best parameters
print(f"Best parameters: {grid_search.best_params_}")

# Use the best pipeline to predict on the test set
best_pipeline = grid_search.best_estimator_
test_data['predicted_delivery_time'] = best_pipeline.predict(filtered_test_data_prepared)

# Cap the predicted delivery times at a certain threshold
cap_value = train_data['delivery_time'].quantile(0.85)
test_data['predicted_delivery_time'] = test_data['predicted_delivery_time'].apply(lambda x: min(x, cap_value))

# Save the predictions
test_data[['order_id', 'predicted_delivery_time']].to_csv(r'C:\Users\gabri\Documents\PROJETOS\PY\PJ_Code\DE\Data\Modelo 2\predictions4.csv', index=False)