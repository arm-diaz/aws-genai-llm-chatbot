FROM public.ecr.aws/lambda/python:3.11

# Copies requirements.txt file into the container
COPY requirements.txt .

# Installs dependencies found in your requirements.txt file
RUN  pip3 install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

WORKDIR ${LAMBDA_TASK_ROOT}
COPY *  ./

# Set the CMD to your handler start function
CMD [ "index.handler" ]