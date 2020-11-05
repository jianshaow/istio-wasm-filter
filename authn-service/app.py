from flask import Flask, request, jsonify

app = Flask(__name__)


@app.route('/authenticate', methods=['POST'])
def authenticate():
    return jsonify({'authenticated': True})


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0")
