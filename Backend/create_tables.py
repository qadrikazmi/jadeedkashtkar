from app.core.database import engine, Base
from app import models  # triggers __init__.py which imports every model

Base.metadata.create_all(bind=engine)
print("Tables created successfully.")
