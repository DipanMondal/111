from celery import Celery,shared_task
from kombu import Queue
import time
import logging
import os 
import tempfile
import shutil

from .frame_extractor import FrameExtractor
from .s3_utils import *


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery Configuration
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6380/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6380/0')

celery = Celery(
    'tasks',
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

celery.conf.update(
    task_queues=(Queue('default'),),
    task_default_queue='default',
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


@celery.task(bind=True)
def frame_extraction_task(self, bucket_name:str, path:str):
    self.update_state(state='PENDING', meta={'status': 'Initializing...', 'progress': 0})
    try:
        s3 = get_s3_client()
        if not check_folder_exists_in_s3(bucket_name=bucket_name,folder_prefix=path):
            logger.info(f'No such folder like {path}')
            return {'status':False, 'message':f'No such folder like {path}'}
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=path)
        mp4_files = [
            obj['Key'] for obj in response.get('Contents', [])
            if obj['Key'].endswith('.mp4') and not obj['Key'].endswith('/')
        ]

        if not mp4_files:
            logger.info(f"No video in {path}")
            return {'status':False, 'message':f"No video in {path}"}

        path = mp4_files[0]  # use the first .mp4 file
        logger.info(f"Found video file: {path}")
        
        temp_dir = tempfile.mkdtemp()
        logger.info(f"Downloading video : {path}")
        download_file_from_s3(bucket=bucket_name, s3_key=path, local_path=os.path.join(temp_dir,'video.mp4'))
        logger.info(f"Downloaded..")
        
        logger.info(f"Extracting video : {path}")
        extractor = FrameExtractor()
        s3_video_dir = os.path.dirname(path)
        output_path = s3_video_dir.replace('/Raw-videos/','/Processed_Frames/')
        
        logger.info(f"save path : {output_path}")
        num = extractor.extract_wagon_frames(video_path=os.path.join(temp_dir,'video.mp4'), s3_save_path=output_path, bucket_name=bucket_name)
        
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        
        self.update_state(state='SUCCESS' if status else 'FAILED', meta={'status': 'Success' if status else 'failed','processed': 100})
        return {'status': status, 'message': f"Saved {num} frames"}
    except Exception as e:
        logging.error(f"Error during comparison: {str(e)}")
        self.update_state(state='FAILED',meta={'status'})
        return {'status': False, 'message': str(e)}