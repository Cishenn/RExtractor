import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Button, Spin, Tooltip, message, Input } from 'antd';
import classnames from 'classnames';
import { __i18n } from '@/isomorphic/i18n';
import { webProxy } from '@/core/webProxy';
import LakeEditor, { IEditorRef } from '@/components/lake-editor/editor';
import { backgroundBridge } from '@/core/bridge/background';
import { IStartOcrResult, ocrManager } from '@/core/ocr-manager';
import { getBookmarkHTMLs, transformUrlToFile } from '@/isomorphic/util';
import SelectSavePosition from '@/components/SelectSavePosition';
import { buildParamsForDoc, buildParamsForNote } from '@/components/lake-editor/helper';
import LinkHelper from '@/isomorphic/link-helper';
import { STORAGE_KEYS } from '@/config';
import useClipShortCut from '@/hooks/useClipShortCut';
import {
  ClipSelectAreaId,
  ClipScreenOcrId,
  ClipCollectLinkId,
  ClipAssistantMessageKey,
  ClipAssistantMessageActions,
} from '@/isomorphic/event/clipAssistant';
import Env from '@/isomorphic/env';
import { DefaultSavePosition, ISavePosition } from '@/core/webProxy/mine';
import { ITag } from '@/core/webProxy/tag';
import { clipConfigManager } from '@/core/configManager/clip';
import LarkIcon from '@/components/LarkIcon';
import { superSidebar } from '@/components/SuperSideBar/index';
import AddTagButton from './component/AddTagButton';
import TagList from './component/TagList';
import styles from './index.module.less';

const LoadingMessage = {
  ocr: __i18n('正在识别中'),
  parse: __i18n('正在解析中'),
};

function ClipContent() {
  const editorRef = useRef<IEditorRef>(null);
  const shortcutMap = useClipShortCut();
  const [loading, setLoading] = useState<{
    type?: keyof typeof LoadingMessage;
    loading: boolean;
  }>({
    loading: false,
  });
  const [selectSavePosition, setSelectSavePosition] = useState<ISavePosition>();
  const [userTags, setUserTags] = useState<ITag[]>([]);
  const [selectTags, setSelectTags] = useState<ITag[]>([]);
  const [title, setTitle] = useState('');

  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
  }, []);

  const onLoad = useCallback(() => {
    // iframe 加载完成后触发一个 message
    window.parent.postMessage(
      {
        key: ClipAssistantMessageKey,
        action: ClipAssistantMessageActions.ready,
      },
      '*',
    );
  }, []);

  const onSave = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.isEmpty()) {
      message.warning(__i18n('内容不能为空'));
      return;
    }

    const showSuccessMessage = (text: string, link: { text: string; href: string }) => {
      if (Env.isRunningHostPage) {
        backgroundBridge.tab.showMessage({
          text,
          type: 'success',
          link,
        });
        return;
      }
      message.success(
        <span>
          {text}
          &nbsp;&nbsp;
          <a target="_blank" href={link.href}>
            {link.text}
          </a>
        </span>,
      );
    };

    setLoading({ loading: true });
    try {
      // 保存到云文档
      if (selectSavePosition?.id === DefaultSavePosition.id) {
        const noteParams = {
          ...(await buildParamsForNote(editor)),
          tag_meta_ids: selectTags.map(item => item.id),
        };
        const result: any = await webProxy.note.create(noteParams);
        const url = LinkHelper.goMyNote(result.id);
        showSuccessMessage(__i18n('保存成功！'), {
          href: url,
          text: __i18n('去云文档查看'),
        });
      } else {
        const docParams = {
          ...(await buildParamsForDoc(editor)),
          title,
          book_id: selectSavePosition?.id as number,
        };
        const doc = await webProxy.doc.create(docParams);
        const url = LinkHelper.goDoc(doc);
        showSuccessMessage(__i18n('保存成功！'), {
          href: url,
          text: __i18n('立即查看'),
        });
      }
      if (Env.isRunningHostPage) {
        backgroundBridge.sidePanel.close();
      }
      editor.setContent('');
    } catch (e: any) {
      if (e.message === '文档上传未结束! 请删除未上传成功的图片') {
        message.error(__i18n('图片正在上传中，请稍后保存'));
      } else {
        message.error(e.message || __i18n('保存失败，请重试！'));
      }
    }
    setLoading({ loading: false });
  };

  const onUploadImage = useCallback(async (params: { data: any }) => {
    const file = await transformUrlToFile(params.data);
    const res = await webProxy.upload.attach(params.data);
    const ocrTask = ocrManager.startOCR('file', file);
    return {
      ...(res || {}),
      ocrTask,
    };
  }, []);

  const onCollectLink = async () => {
    const tab = await backgroundBridge.tab.getCurrent();
    const { quote } = getBookmarkHTMLs({
      title: tab?.title || '',
      url: tab?.url || '',
    });
    editorRef.current?.appendContent(quote);
    // 回到文档开头
    editorRef.current?.focusToStart();
  };

  const onClipPage = async () => {
    setLoading({ loading: true, type: 'parse' });
    const html = await backgroundBridge.clip.clipPage();
    if (!html) {
      setLoading({ loading: false });
      return;
    }
    const isAddLink = await addLinkWhenEmpty();
    if (!isAddLink) {
      editorRef.current?.insertBreakLine();
    }
    editorRef.current?.appendContent(html);
    setLoading({ loading: false });
  };

  const addLinkWhenEmpty = async () => {
    if (!editorRef.current?.isEmpty()) {
      return false;
    }
    const config = await clipConfigManager.get();
    if (!config.addLink) return false;
    await onCollectLink();
    return true;
  };

  const onSelectArea = async () => {
    setLoading({ loading: true, type: 'parse' });
    const html = await backgroundBridge.clip.selectArea();
    if (!html) {
      setLoading({ loading: false });
      return;
    }
    const isAddLink = await addLinkWhenEmpty();
    if (!isAddLink) {
      editorRef.current?.insertBreakLine();
    }
    editorRef.current?.appendContent(html);
    setLoading({ loading: false });
  };

  const onScreenOcr = async () => {
    try {
      const res = await backgroundBridge.clip.screenOcr();
      if (res) {
        setLoading({ loading: true, type: 'ocr' });
        const textArray: IStartOcrResult = await new Promise(resolve => {
          const image = new Image();
          image.src = res;
          image.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const width = image.width;
            const height = image.height;
            // 在canvas上绘制截取区域
            canvas.width = width;
            canvas.height = height;
            context?.drawImage(image, 0, 0, width, height, 0, 0, width, height);
            canvas.toBlob(async blob => {
              const result = await ocrManager.startOCR('blob', blob || '');
              resolve(result);
            });
          };
        });
        const text = textArray?.map(item => item.text)?.join('') || '';
        if (!text) {
          setLoading({ loading: false });
          return;
        }
        const isAddLink = await addLinkWhenEmpty();
        if (!isAddLink) {
          editorRef.current?.insertBreakLine();
        }
        editorRef.current?.appendContent(text);
      }
    } catch (error) {
      console.log('ocr error:', error);
    }
    setLoading({ loading: false });
  };

  const handleRequestTag = async () => {
    try {
      const tags = await webProxy.tag.index();
      setUserTags(tags);
    } catch (error) {
      //
    }
  };

  const renderLoading = () => {
    if (!loading.loading) {
      return null;
    }
    const text = LoadingMessage[loading.type as keyof typeof LoadingMessage] || '';
    return (
      <div className={styles.loadingWrapper}>
        <Spin />
        {!!text && <div className={styles.tip}>{text}</div>}
      </div>
    );
  };

  useEffect(() => {
    if (selectSavePosition?.id !== DefaultSavePosition.id) {
      return;
    }
    handleRequestTag();
  }, [selectSavePosition]);

  useEffect(() => {
    const onStartScreenOcr = () => {
      const div = document.querySelector(`#${ClipScreenOcrId}`);
      (div as HTMLDivElement)?.click();
    };

    const onMessage = async (e: any) => {
      if (e.data.key !== ClipAssistantMessageKey) {
        return;
      }
      switch (e.data.action) {
        case ClipAssistantMessageActions.addContent: {
          const isAddLink = await addLinkWhenEmpty();
          if (!isAddLink) {
            editorRef.current?.insertBreakLine();
          }
          editorRef.current?.appendContent(e.data?.data);
          break;
        }
        case ClipAssistantMessageActions.startScreenOcr: {
          onStartScreenOcr();
          break;
        }
        default: {
          break;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  useEffect(() => {
    backgroundBridge.tab.getCurrent().then(tab => {
      setTitle(tab?.title || '');
    });
  }, []);

  return (
    <div
      className={classnames(styles.wrapper, {
        [styles.hidden]: superSidebar.currentAssistant?.id !== 1,
      })}
    >
      {renderLoading()}
      <div className={styles.headerWrapper}>
        <Tooltip title={Env.isRunningHostPage ? shortcutMap.selectArea : ''} getPopupContainer={node => node}>
          <div
            className={styles.headerItem}
            onClick={onSelectArea}
            id={ClipSelectAreaId}
            data-aspm-click="c340502.d391169"
            data-aspm-desc="选取抽取"
          >
            <LarkIcon className={styles.icon} name="clipper" />
            <span>{__i18n('选取抽取')}</span>
          </div>
        </Tooltip>
        <Tooltip title={Env.isRunningHostPage ? shortcutMap.startOcr : ''} getPopupContainer={node => node}>
          <div
            className={styles.headerItem}
            onClick={onScreenOcr}
            id={ClipScreenOcrId}
            data-aspm-click="c340502.d391174"
            data-aspm-desc="ocr提取"
          >
            <LarkIcon className={styles.icon} name="ocr-icon" />
            <span>{__i18n('OCR 提取')}</span>
          </div>
        </Tooltip>

        <Tooltip
          title={Env.isRunningHostPage ? shortcutMap.clipPage : ''}
          placement="top"
          getPopupContainer={node => node}
        >
          <div
            className={styles.headerItem}
            onClick={onClipPage}
            id={ClipCollectLinkId}
            data-aspm-click="c340502.d391175"
            data-aspm-desc="全文抽取"
          >
            <LarkIcon className={styles.icon} name="clip-page" />
            <span>{__i18n('全文抽取')}</span>
          </div>
        </Tooltip>
      </div>
      <div
        className={classnames(styles.titleWrapper, {
          [styles.none]: !selectSavePosition?.id,
        })}
      >
        <Input.TextArea
          className={styles.title}
          placeholder={__i18n('输入标题')}
          value={title}
          autoSize={{ minRows: 1, maxRows: 100 }}
          onChange={onTitleChange}
        />
      </div>
      <div className={styles.editorWrapper}>
        <LakeEditor ref={editorRef} value="" onLoad={onLoad} uploadImage={onUploadImage as any} onSave={onSave} />
      </div>
      {selectSavePosition?.id === DefaultSavePosition.id && (
        <TagList selectTags={selectTags} updateSelectTags={setSelectTags} />
      )}
      <div className={styles.saveOptionWrapper}>
        <div className={styles.savePositionWrapper}>
          <SelectSavePosition rememberKey={STORAGE_KEYS.USER.CLIPPING_SAVE_POSITION} onChange={setSelectSavePosition}>
            <AddTagButton
              tags={userTags}
              selectTags={selectTags}
              updateTags={setUserTags}
              updateSelectTags={setSelectTags}
              key={selectTags.length}
            />
          </SelectSavePosition>
        </div>
        <Button type="primary" onClick={onSave}>
          {__i18n('保存')}
        </Button>
      </div>
    </div>
  );
}

export default ClipContent;
