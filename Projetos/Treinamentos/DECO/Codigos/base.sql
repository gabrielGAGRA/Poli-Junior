SELECT 
    o.delivery_time_model - o.delivery_time AS ModelErrorDays,
    o.delivery_time,
    o.delivery_time_model,
    oi.freight_value,
    p.product_weight_g,
    p.product_length_cm * p.product_height_cm * p.product_width_cm AS volume,
    p.product_category_name,
    c.customer_zip_code_prefix,
    c.customer_state,
    c.customer_city,
    s.seller_zip_code_prefix,
    s.seller_state,
    s.seller_city,
    date_diff('second', o.order_delivered_carrier_date, o.order_delivered_customer_date) / (24 * 60 * 60.0) AS Days_Delivery_CarrierToCustomer,
    o.order_id,
    c.customer_id
FROM
    orders o
JOIN 
    order_items oi ON o.order_id = oi.order_id
JOIN 
    products p ON oi.product_id = p.product_id
JOIN 
    customers c ON o.customer_id = c.customer_id
JOIN 
    sellers s ON oi.seller_id = s.seller_id
