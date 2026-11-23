import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, QrCode, X } from 'lucide-react'
import { certificateId } from '../lib/chain'
import { Busy, Notice } from './ui'

export function VerifyQr({ url }: { url: string }) {
  const [visible, setVisible] = useState(false)
  const [generated, setGenerated] = useState<{ url: string; image: string } | null>(null)
  const result = generated?.url === url ? generated : null
  useEffect(() => {
    if (!visible) return
    let current = true
    void import('qrcode').then(qr => qr.toDataURL(url, {
      width: 244,
      margin: 3,
      errorCorrectionLevel: 'M',
    })).then(data => {
      if (current) setGenerated({ url, image: data })
    }).catch(() => { if (current) setGenerated({ url, image: '' }) })
    return () => { current = false }
  }, [url, visible])

  return <div>
    <button className="button secondary small" type="button" aria-expanded={visible} onClick={() => setVisible(!visible)}>
      <QrCode size={17} />{visible ? 'Ẩn mã QR' : 'Hiện mã QR'}
    </button>
    {visible && <div className="qr-result">
      {result?.image ? <img src={result.image} width="224" height="224" alt="Mã QR mở trang xác minh chứng chỉ" />
        : result ? <Notice tone="error">Không tạo được mã QR.</Notice> : <Busy />}
    </div>}
  </div>
}

export function QrScanner({ onCode, close }: { onCode: (id: string) => void; close: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState(false)
  const [scanningFile, setScanningFile] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!camera) return
    let current = true
    let frame = 0
    let stream: MediaStream | null = null
    let lastRead = 0
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !context) throw new Error('Quét bằng camera cần HTTPS hoặc localhost.')
      const { default: scan } = await import('jsqr')
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      const element = video.current
      if (!current || !element) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      element.srcObject = stream
      await element.play()
      function read(now: number) {
        if (!current || !element || !context) return
        if (now - lastRead > 170 && element.videoWidth && element.readyState >= 2) {
          lastRead = now
          const ratio = Math.min(1, 1000 / Math.max(element.videoWidth, element.videoHeight))
          canvas.width = Math.round(element.videoWidth * ratio)
          canvas.height = Math.round(element.videoHeight * ratio)
          context.drawImage(element, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          const data = scan(pixels.data, pixels.width, pixels.height)?.data
          if (data) {
            const id = certificateId(data)
            if (id) { onCode(id); return }
            setError('Mã QR này không chứa mã chứng chỉ EduCert hợp lệ.')
          }
        }
        frame = requestAnimationFrame(read)
      }
      frame = requestAnimationFrame(read)
    }
    void start().catch((fault: unknown) => {
      if (current) {
        setError(fault instanceof Error && fault.message.includes('HTTPS') ? fault.message : 'Không mở được camera. Hãy kiểm tra quyền hoặc chọn ảnh mã QR.')
        setCamera(false)
      }
    })
    return () => {
      current = false
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [camera, onCode])

  async function readImage(file?: File) {
    if (!file) return
    setCamera(false)
    setScanningFile(true)
    setError('')
    try {
      const { default: scan } = await import('jsqr')
      const image = await createImageBitmap(file)
      try {
        const canvas = document.createElement('canvas')
        const ratio = Math.min(1, 1600 / Math.max(image.width, image.height))
        canvas.width = Math.max(1, Math.round(image.width * ratio))
        canvas.height = Math.max(1, Math.round(image.height * ratio))
        const context = canvas.getContext('2d')
        if (!context) throw new Error()
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const raw = scan(pixels.data, pixels.width, pixels.height)?.data
        const id = raw && certificateId(raw)
        if (id) onCode(id)
        else setError('Không tìm thấy mã QR chứng chỉ EduCert trong ảnh.')
      } finally { image.close() }
    } catch { setError('Không đọc được ảnh mã QR. Hãy thử một ảnh rõ nét khác.') }
    finally { setScanningFile(false) }
  }

  return <div className="scanner">
    <div className="panel-heading"><h2>Quét mã QR</h2><button type="button" className="icon-button" aria-label="Đóng trình quét" onClick={close}><X size={18} /></button></div>
    <div className="button-row">
      <button className="button secondary small" type="button" disabled={scanningFile} onClick={() => { setError(''); setCamera(!camera) }}><Camera size={17} />{camera ? 'Tắt camera' : 'Mở camera'}</button>
      <label className={'button secondary small file-button' + (scanningFile ? ' disabled' : '')}>
        <ImagePlus size={17} />{scanningFile ? 'Đang đọc ảnh…' : 'Chọn ảnh QR'}
        <input type="file" accept="image/*" disabled={scanningFile} aria-label="Chọn ảnh QR" onChange={event => {
          void readImage(event.target.files?.[0])
          event.currentTarget.value = ''
        }} />
      </label>
    </div>
    {camera && <video ref={video} className="scanner-video" muted playsInline />}
    {error && <Notice tone="error">{error}</Notice>}
  </div>
}
